import React, { createContext, useContext, useRef, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const ChatContext = createContext();
export const useChat = () => useContext(ChatContext);

export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMatched, setIsMatched] = useState(false);
  const [matchDetails, setMatchDetails] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const callStartedRef = useRef(false);
  const pendingCandidates = useRef([]);

  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: 'turn:relay1.expressturn.com:3480',
        username: '174672462322246224',
        credential: 'wPWy5/Q8xaF3LVOKZOdExrhnZ+4='
      }
    ],
  };

  const initializeSocket = (gender, interest, name, mode) => {
    if (socketRef.current) return socketRef.current;

    const socketInstance = window.socket || io('http://localhost:3000', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
      withCredentials: true,
    });

    if (!window.socket) {
      window.socket = socketInstance;
    }

    socketRef.current = socketInstance;

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setIsConnecting(false);
    });

    socketInstance.on('connect', () => {
      console.log('Socket connected:', socketInstance.id);
      socketInstance.emit('user-details', { gender, interest, name, mode });
      setIsConnecting(true);
    });

    socketInstance.on('find other', () => {
      cleanupMatch();
      setIsConnecting(true);  
      if (user) {
        setTimeout(() => {
          socketInstance.emit('user-details', {
            gender: user.gender,
            interest: user.interest,
            mode
          });
        }, 1000); // Increased delay to ensure proper cleanup
      }
    });

    socketInstance.on('match-found', (data) => {
      if (data.matched) {
        setIsMatched(true);
        setIsConnecting(false);
        setMatchDetails({ partnerId: data.socketId });
        console.log("Matched with:", data.socketId);
      }
    });

    socketInstance.on("cleanup", () => {
      cleanupMatch();
      setIsConnecting(true);
    });

    socketInstance.on("disconect", () => {
      cleanupMatch();
      setIsConnecting(true);
    });

    return socketInstance;
  };

  const disconnectSocket = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      window.socket = null;
    }
    cleanupMatch();
  };

  const cleanupMatch = () => {
    if (peerConnection) {
      // Remove all event listeners
      peerConnection.ontrack = null;
      peerConnection.onicecandidate = null;
      peerConnection.onsignalingstatechange = null;
      peerConnection.oniceconnectionstatechange = null;
      
      // Close all transceivers
      if (peerConnection.getTransceivers) {
        peerConnection.getTransceivers().forEach(transceiver => {
          if (transceiver.stop) {
            transceiver.stop();
          }
        });
      }

      // Close the connection
      peerConnection.close();
      setPeerConnection(null);
    }
    
    setIsMatched(false);
    setMatchDetails(null);
    callStartedRef.current = false;
    pendingCandidates.current = [];
  };

  const disconnectFromMatch = (mode) => {
    const socket = socketRef.current;
    if (socket && matchDetails) {
      endVideoCall();
      socket.emit('disconnect-chat', matchDetails.partnerId, mode);
      cleanupMatch();
    }
  };

  const next = (mode) => {
    const socket = socketRef.current;
    if (socket && matchDetails) {
      endVideoCall();
      socket.emit('next', matchDetails.partnerId, mode);
      cleanupMatch();
      
      // Re-emit user details after a delay to ensure proper cleanup
      if (user) {
        setTimeout(() => {
          if (socket.connected) {
            socket.emit('user-details', {
              gender: user.gender,
              interest: user.interest,
              mode
            });
          }
        }, 1000);
      }
    }
  };

  const sendMessage = (message, partnerId) => {
    const socket = socketRef.current;
    if (socket && partnerId) {
      socket.emit('send-message', message, partnerId);
    }
  };

  const startVideoCall = async (partnerId, localStream, remoteVideoElement) => {
    if (!partnerId || !localStream) return;
    
    const socket = socketRef.current;
    if (!socket) return;

    try {
      // Ensure cleanup of existing connection
      if (peerConnection) {
        cleanupMatch();
      }

      const pc = new RTCPeerConnection(iceServers);
      setPeerConnection(pc);

      // Monitor connection state
      pc.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          cleanupMatch();
        }
      };

      pc.onsignalingstatechange = () => {
        console.log("Signaling State:", pc.signalingState);
      };

      // Add local tracks
      localStream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, localStream);
        } catch (error) {
          console.error('Error adding track:', error);
        }
      });

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socket.connected) {
          socket.emit("ice-candidate", event.candidate, partnerId);
        }
      };

      // Handle remote stream
      pc.ontrack = (event) => {
        if (remoteVideoElement && event.streams[0]) {
          remoteVideoElement.srcObject = event.streams[0];
        }
      };

      // Remove existing listeners before adding new ones
      socket.off("video-offer");
      socket.off("video-answer");
      socket.off("ice-candidate");
      socket.off("end-video");

      // Handle video offer
      socket.on("video-offer", async (offer, fromSocketId) => {
        if (partnerId !== fromSocketId) return;
        
        try {
          if (pc.signalingState !== "stable") {
            await Promise.all([
              pc.setLocalDescription({ type: "rollback" }),
              pc.setRemoteDescription(new RTCSessionDescription(offer))
            ]);
          } else {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
          }
          
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("video-answer", answer, fromSocketId);
        } catch (error) {
          console.error("Error handling offer:", error);
          cleanupMatch();
        }
      });

      // Handle video answer
      socket.on("video-answer", async (answer) => {
        try {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            
            // Process pending candidates after remote description is set
            while (pendingCandidates.current.length > 0) {
              const candidate = pendingCandidates.current.shift();
              await pc.addIceCandidate(candidate).catch(console.error);
            }
          }
        } catch (error) {
          console.error("Error applying answer:", error);
          cleanupMatch();
        }
      });

      // Handle ICE candidates
      socket.on("ice-candidate", async (candidate) => {
        try {
          const iceCandidate = new RTCIceCandidate(candidate);
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(iceCandidate).catch(console.error);
          } else {
            pendingCandidates.current.push(iceCandidate);
          }
        } catch (error) {
          console.error("ICE candidate error:", error);
        }
      });

      // Handle end video
      socket.on("end-video", () => {
        if (remoteVideoElement) {
          remoteVideoElement.srcObject = null;
        }
        cleanupMatch();
      });

      // Create and send offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      socket.emit("video-offer", offer, partnerId);

      return pc;
    } catch (error) {
      console.error('Error starting video call:', error);
      cleanupMatch();
    }
  };

  const endVideoCall = () => {
    const socket = socketRef.current;
    if (socket && matchDetails) {
      socket.emit("end-video", matchDetails.partnerId);
    }
    cleanupMatch();
  };

  const value = {
    socket: socketRef.current,
    isConnecting,
    isMatched,
    matchDetails,
    initializeSocket,
    disconnectSocket,
    disconnectFromMatch,
    next,
    setIsConnecting,
    sendMessage,
    startVideoCall,
    endVideoCall,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};