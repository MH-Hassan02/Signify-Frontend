import React, { useState, useEffect, useRef } from "react";
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaPhoneSlash,
} from "react-icons/fa";
import { toast } from "react-toastify";
import socket from "../../socket";
import "./VideoCall.css";
import { useVideoCall } from "../../contexts/VideoCallContext";
import { useNavigate, useLocation } from "react-router-dom";

const VideoCall = ({
  currentUser,
  contactId,
  contactProfilePic,
  contactUsername,
  onClose,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isIncomingCall, callData } = location.state || {};

  // Refs for managing media elements and state
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const videoToggleLock = useRef(false);
  const hasInitiatedCall = useRef(false);
  const iceCandidatesQueue = useRef([]);
  const connectionStateRef = useRef('new');

  // State management
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isRemoteVideoEnabled, setIsRemoteVideoEnabled] = useState(true);
  const [isRemoteMicEnabled, setIsRemoteMicEnabled] = useState(true);

  const { setIncomingCall, isCalling, setIsCalling } = useVideoCall();

  const servers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: [
          "turn:a.relay.metered.ca:80",
          "turn:a.relay.metered.ca:80?transport=tcp",
          "turn:a.relay.metered.ca:443",
          "turn:a.relay.metered.ca:443?transport=tcp"
        ],
        username: "e2c0e5ddc6c9ab8bc726db55",
        credential: "2D+rvHqfUe+9Yf/N"
      }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  };

  // Helper function for setting up video tracks
  const setupVideoTrack = async (track, videoElement) => {
    if (!track || !videoElement) return;
    
    try {
      // Get the existing stream or create a new one
      const existingStream = videoElement.srcObject instanceof MediaStream ? 
        videoElement.srcObject : new MediaStream();
      
      // Remove any existing tracks of the same kind
      existingStream.getTracks().forEach(existingTrack => {
        if (existingTrack.kind === track.kind) {
          existingStream.removeTrack(existingTrack);
        }
      });
      
      // Add the new track
      existingStream.addTrack(track);
      
      // Configure video element
      videoElement.srcObject = existingStream;
      videoElement.playsInline = true;
      videoElement.autoplay = true;
      
      // Only mute local video
      if (videoElement === localVideoRef.current) {
        videoElement.muted = true;
      }

      // Ensure track is enabled
      track.enabled = true;
      
      // Force a play attempt
      try {
        await videoElement.play();
      } catch (playError) {
        if (playError.name === 'NotAllowedError') {
          const playPromise = () => {
            videoElement.play().catch(console.error);
            document.removeEventListener('click', playPromise);
          };
          document.addEventListener('click', playPromise);
        } else {
          throw playError;
        }
      }
      
      // Monitor track state
      track.onended = () => {
        if (track.kind === 'video' && videoElement === remoteVideoRef.current) {
          setIsRemoteVideoEnabled(false);
        }
      };
      
      track.onmute = () => {
        if (track.kind === 'video' && videoElement === remoteVideoRef.current) {
          setIsRemoteVideoEnabled(false);
        }
      };
      
      track.onunmute = () => {
        if (track.kind === 'video' && videoElement === remoteVideoRef.current) {
          setIsRemoteVideoEnabled(true);
        }
      };
      
    } catch (err) {
      console.error(`Failed to setup ${track.kind} track:`, err);
      toast.error(`Failed to setup ${track.kind}`);
    }
  };

  // Enhanced peer connection setup
  const setupPeerConnection = async (stream) => {
    const pc = new RTCPeerConnection(servers);
    peerConnectionRef.current = pc;

    // Add all tracks to the peer connection with proper configuration
    stream.getTracks().forEach(track => {
      track.enabled = true;
      const sender = pc.addTrack(track, stream);
      
      // Monitor sender state
      if (sender.track) {
        sender.track.onended = () => {
          console.log(`${sender.track.kind} track ended`);
          if (sender.track.kind === 'video') {
            setIsVideoOn(false);
          } else if (sender.track.kind === 'audio') {
            setIsMicOn(false);
          }
        };
      }
    });

    // Handle incoming tracks with enhanced error handling
    pc.ontrack = async (event) => {
      console.log("Received track:", event.track.kind);
      
      let remoteStream = null;
      if (event.streams && event.streams[0]) {
        remoteStream = event.streams[0];
      } else {
        remoteStream = remoteStreamRef.current || new MediaStream();
        remoteStream.addTrack(event.track);
      }
      
      remoteStreamRef.current = remoteStream;
      setRemoteStream(remoteStream);
      
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.playsInline = true;
        remoteVideoRef.current.autoplay = true;
        
        // Ensure the track is enabled
        event.track.enabled = true;
        
        try {
          await remoteVideoRef.current.play();
          console.log("Remote video playing successfully");
        } catch (err) {
          console.error("Error playing remote video:", err);
          if (err.name === 'NotAllowedError') {
            const playPromise = () => {
              remoteVideoRef.current.play().catch(console.error);
              document.removeEventListener('click', playPromise);
            };
            document.addEventListener('click', playPromise);
          }
        }
      }

      // Enhanced track state monitoring
      event.track.onended = () => {
        console.log(`${event.track.kind} track ended`);
        if (event.track.kind === 'video') {
          setIsRemoteVideoEnabled(false);
        } else if (event.track.kind === 'audio') {
          setIsRemoteMicEnabled(false);
        }
      };
      
      event.track.onmute = () => {
        console.log(`${event.track.kind} track muted`);
        if (event.track.kind === 'video') {
          setIsRemoteVideoEnabled(false);
        } else if (event.track.kind === 'audio') {
          setIsRemoteMicEnabled(false);
        }
      };
      
      event.track.onunmute = () => {
        console.log(`${event.track.kind} track unmuted`);
        if (event.track.kind === 'video') {
          event.track.enabled = true;
          setIsRemoteVideoEnabled(true);
        } else if (event.track.kind === 'audio') {
          event.track.enabled = true;
          setIsRemoteMicEnabled(true);
        }
      };
    };

    // Enhanced connection state monitoring
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log("Connection state changed:", state);
      connectionStateRef.current = state;
      
      if (state === 'connected') {
        setIsConnected(true);
        // Ensure all tracks are enabled when connected
        pc.getSenders().forEach(sender => {
          if (sender.track) {
            sender.track.enabled = true;
          }
        });
      } else if (state === 'failed' || state === 'disconnected') {
        console.log("Connection failed or disconnected, attempting recovery");
        pc.restartIce();
        if (state === 'failed') {
          renegotiateConnection(pc);
        }
      }
    };

    // Enhanced ICE connection monitoring
    pc.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        console.log("ICE connection failed, restarting ICE");
        pc.restartIce();
      }
    };

    // Enhanced ICE candidate handling
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Sending ICE candidate");
        socket.emit("ice-candidate", {
          to: contactId,
          candidate: event.candidate
        });
      }
    };

    return pc;
  };

  // Add renegotiation helper
  const renegotiateConnection = async (pc) => {
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        iceRestart: true
      });
      
      await pc.setLocalDescription(offer);
      
      socket.emit("call-update", {
        to: contactId,
        offer: pc.localDescription
      });
    } catch (err) {
      console.error("Renegotiation failed:", err);
    }
  };

  // Enhanced local media setup
  const getLocalMedia = async () => {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Ensure all tracks are enabled and properly configured
      stream.getTracks().forEach(track => {
        track.enabled = true;
        if (track.kind === 'video') {
          track.applyConstraints({
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }).catch(console.error);
        }
      });
      
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      // Set up local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.playsInline = true;
        localVideoRef.current.autoplay = true;
        try {
          await localVideoRef.current.play();
        } catch (err) {
          console.error("Error playing local video:", err);
        }
      }
      
      return stream;
    } catch (err) {
      console.error("Error accessing media devices:", err);
      toast.error("Failed to access camera or microphone");
      throw err;
    }
  };

  // Modified video toggle
  const toggleVideo = async () => {
    if (videoToggleLock.current) return;

    try {
      videoToggleLock.current = true;
      const pc = peerConnectionRef.current;
      if (!pc) return;

      const videoSender = pc.getSenders().find(sender => 
        sender.track && sender.track.kind === 'video'
      );

      if (!videoSender) return;

      const newState = !isVideoOn;
      setIsVideoOn(newState);

      const currentTrack = videoSender.track;
      if (currentTrack) {
        currentTrack.enabled = newState;
      }

      if (!newState) {
        // If turning video off, we don't need to replace the track
      } else {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const newVideoTrack = newStream.getVideoTracks()[0];
          
          await videoSender.replaceTrack(newVideoTrack);
          
          if (localVideoRef.current) {
            await setupVideoTrack(newVideoTrack, localVideoRef.current);
          }

          if (localStreamRef.current) {
            const oldTrack = localStreamRef.current.getVideoTracks()[0];
            if (oldTrack) {
              oldTrack.stop();
              localStreamRef.current.removeTrack(oldTrack);
            }
            localStreamRef.current.addTrack(newVideoTrack);
          }
        } catch (err) {
          console.error("Failed to get new video track:", err);
          setIsVideoOn(false);
          toast.error("Failed to enable video");
        }
      }
    } catch (err) {
      console.error("Toggle failed:", err);
      toast.error("Failed to toggle video");
    } finally {
      videoToggleLock.current = false;
    }
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);

        if (peerConnectionRef.current) {
          const senders = peerConnectionRef.current.getSenders();
          const audioSender = senders.find(sender => sender.track?.kind === 'audio');
          if (audioSender && audioSender.track) {
            audioSender.track.enabled = audioTrack.enabled;
          }
        }
      }
    }
  };

  // Call initialization
  useEffect(() => {
    const initializeCall = async () => {
      if (hasInitiatedCall.current) return;
      hasInitiatedCall.current = true;

      try {
        const stream = await getLocalMedia();
        
        if (isIncomingCall && callData) {
          await handleIncomingCall(stream);
        } else if (!isIncomingCall) {
          await startCall(stream);
        }
      } catch (err) {
        console.error("Call initialization failed:", err);
        endCall();
      }
    };

    initializeCall();
  }, []);

  // Modified handleIncomingCall
  const handleIncomingCall = async (stream) => {
    try {
      const pc = await setupPeerConnection(stream);
      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
      
      // Process any queued ICE candidates
      while (iceCandidatesQueue.current.length) {
        const candidate = iceCandidatesQueue.current.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Failed to add candidate:", err);
        }
      }
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      // Ensure all local tracks are properly added and enabled
      stream.getTracks().forEach(track => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === track.kind);
        if (!sender) {
          pc.addTrack(track, stream);
        }
        track.enabled = true;
      });
      
      socket.emit("answer-call", {
        to: callData.from._id,
        answer: pc.localDescription
      });
    } catch (err) {
      console.error("Error in incoming call flow:", err);
      toast.error("Failed to setup incoming call");
      endCall();
    }
  };

  // Modified startCall
  const startCall = async (stream) => {
    try {
      setIsCalling(true);
      
      const pc = await setupPeerConnection(stream);
      
      // Ensure all tracks are enabled
      stream.getTracks().forEach(track => {
        track.enabled = true;
      });
      
      // Wait for ICE gathering to begin
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socket.emit("call-user", {
        to: contactId,
        offer: pc.localDescription,
        from: currentUser,
      });
    } catch (err) {
      console.error("Error starting call:", err);
      toast.error("Failed to start call");
      setIsCalling(false);
      endCall();
    }
  };

  // Clean up call resources
  const endCall = () => {
    socket.emit("end-call", { to: contactId });

    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch (err) {
        console.error("Error closing peer connection:", err);
      }
      peerConnectionRef.current = null;
    }

    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      } catch (err) {
        console.error("Error stopping local tracks:", err);
      }
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      try {
        remoteStreamRef.current.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      } catch (err) {
        console.error("Error stopping remote tracks:", err);
      }
      remoteStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setIsCalling(false);
    setIncomingCall(null);
    setIsConnected(false);
    setIsVideoReady(false);
    
    onClose?.();
    navigate("/calls", { replace: true });
  };

  // Socket event handlers
  useEffect(() => {
    socket.on("call-accepted", async ({ answer }) => {
      try {
        if (peerConnectionRef.current && answer) {
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
        }
      } catch (err) {
        console.error("Error setting remote description:", err);
      }
    });

    socket.on("call-ended", () => {
      toast.info("Call ended");
      endCall();
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        if (peerConnectionRef.current) {
          if (peerConnectionRef.current.remoteDescription) {
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          } else {
            iceCandidatesQueue.current.push(candidate);
          }
        }
      } catch (err) {
        console.error("Error handling candidate:", err);
      }
    });

    socket.on("call-update", async ({ offer }) => {
      if (!peerConnectionRef.current) return;
      
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        
        socket.emit("call-update-answer", {
          to: contactId,
          answer: answer
        });
      } catch (err) {
        console.error("Error handling call update:", err);
      }
    });

    socket.on("call-update-answer", async ({ answer }) => {
      if (!peerConnectionRef.current) return;
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error("Error setting remote description:", err);
      }
    });

    return () => {
      socket.off("call-accepted");
      socket.off("call-ended");
      socket.off("ice-candidate");
      socket.off("call-update");
      socket.off("call-update-answer");
      endCall();
    };
  }, [contactId]);

  // Enhanced connection state monitoring
  useEffect(() => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    const handleConnectionStateChange = () => {
      if (pc.connectionState === 'failed') {
        try {
          pc.restartIce();
          const senders = pc.getSenders();
          senders.forEach(async sender => {
            if (sender.track) {
              sender.track.enabled = true;
              if (sender.track.kind === 'video' && !isVideoOn) {
                sender.track.enabled = false;
              }
            }
          });
        } catch (err) {
          console.error("Recovery failed:", err);
        }
      }
    };

    pc.addEventListener('connectionstatechange', handleConnectionStateChange);
    return () => pc.removeEventListener('connectionstatechange', handleConnectionStateChange);
  }, [isVideoOn]);

  return (
    <div className="videoCallWrapper">
      <div className="videoContainer">
        <div className="videoSlot">
          {!isVideoOn ? (
            <img
              src={currentUser.profilePic}
              alt={currentUser.username}
              className="videoCallVideo"
            />
          ) : (
            <video
              className="videoCallVideo local"
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ transform: 'scaleX(-1)' }}
            />
          )}
          <p className="contactNameVideo">
            {currentUser?.username} {!isMicOn && <FaMicrophoneSlash />}
          </p>
        </div>

        <div className="videoSlot">
          {(!remoteStream || !isRemoteVideoEnabled) ? (
            <img
              src={contactProfilePic}
              alt={contactUsername}
              className="videoCallVideo"
            />
          ) : (
            <video
              className="videoCallVideo remote"
              ref={remoteVideoRef}
              autoPlay
              playsInline
            />
          )}
          <p className="contactNameVideo">
            {contactUsername} {!isRemoteMicEnabled && <FaMicrophoneSlash />}
          </p>
        </div>
      </div>

      <div className="videoControls">
        <button onClick={toggleMic}>
          {isMicOn ? <FaMicrophone /> : <FaMicrophoneSlash />}
        </button>
        <button onClick={toggleVideo}>
          {isVideoOn ? <FaVideo /> : <FaVideoSlash />}
        </button>
        <button onClick={endCall} className="endCallBtn">
          <FaPhoneSlash />
        </button>
      </div>
    </div>
  );
};

export default VideoCall; 