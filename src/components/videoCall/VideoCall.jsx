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
    console.log("Setting up peer connection");
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls: "turn:openrelay.metered.ca:80",
          username: "openrelayproject",
          credential: "openrelayproject",
        }
      ]
    });
    peerConnectionRef.current = pc;

    // Add all tracks to the peer connection with proper configuration
    stream.getTracks().forEach(track => {
      console.log(`Adding ${track.kind} track to peer connection`);
      track.enabled = true;
      const sender = pc.addTrack(track, stream);
      console.log(`${track.kind} track added successfully`);
    });

    // Handle incoming tracks with enhanced error handling
    pc.ontrack = async (event) => {
      console.log("Received track:", event.track.kind);
      
      let remoteStream = null;
      if (event.streams && event.streams[0]) {
        console.log("Using existing remote stream");
        remoteStream = event.streams[0];
      } else {
        console.log("Creating new remote stream");
        remoteStream = remoteStreamRef.current || new MediaStream();
        remoteStream.addTrack(event.track);
      }
      
      remoteStreamRef.current = remoteStream;
      setRemoteStream(remoteStream);
      
      if (remoteVideoRef.current) {
        console.log("Setting up remote video element");
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.playsInline = true;
        remoteVideoRef.current.autoplay = true;
        
        // Ensure the track is enabled
        event.track.enabled = true;
        
        // Force play video properly
        remoteVideoRef.current.onloadedmetadata = () => {
          console.log("Remote video metadata loaded");
          remoteVideoRef.current?.play()
            .then(() => console.log("Remote video playing successfully"))
            .catch(err => console.error("Error playing remote video on stream:", err));
        };

        if (remoteVideoRef.current.readyState >= 2) {
          console.log("Remote video ready state >= 2, forcing play");
          remoteVideoRef.current.play()
            .then(() => console.log("Remote video playing successfully after force"))
            .catch(err => console.error("Error forcing remote video play:", err));
        }

        // Monitor track state
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
      }
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
        // Also ensure all remote tracks are enabled
        pc.getReceivers().forEach(receiver => {
          if (receiver.track) {
            receiver.track.enabled = true;
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
      // Step 1: Get video stream
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: true
      });

      console.log("Video stream tracks:", videoStream.getTracks());

      // Step 2: Check if audioinput exists
      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log("Available media devices:");
      devices.forEach(device => console.log(device.kind, device.label));

      const hasMic = devices.some(device => device.kind === "audioinput");

      // Step 3: Merge video + audio if mic exists
      let stream;
      if (hasMic) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: true
          });
          stream = new MediaStream([
            ...videoStream.getTracks(),
            ...audioStream.getTracks()
          ]);
        } catch (err) {
          console.warn("Mic access denied or unavailable. Using video only.", err);
          stream = videoStream;
        }
      } else {
        console.warn("No mic found. Using video only.");
        stream = videoStream;
      }

      // Ensure all tracks are enabled
      stream.getTracks().forEach(track => {
        console.log(`Ensuring ${track.kind} track is enabled`);
        track.enabled = true;
      });
      
      localStreamRef.current = stream;
      setLocalStream(stream);
      
      // Set up local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.playsInline = true;
        localVideoRef.current.autoplay = true;

        localVideoRef.current.onloadedmetadata = () => {
          console.log("Local video metadata loaded");
          localVideoRef.current?.play()
            .then(() => console.log("Local video playing successfully"))
            .catch(err => console.error("Error playing local video:", err));
        };

        if (localVideoRef.current.readyState >= 2) {
          console.log("Local video ready state >= 2, forcing play");
          localVideoRef.current.play()
            .then(() => console.log("Local video playing successfully after force"))
            .catch(err => console.error("Error forcing local video play:", err));
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
    console.log("Setting up socket event listeners for video call");
    
    socket.on("call-accepted", async ({ answer }) => {
      console.log("Call accepted event received:", answer);
      try {
        if (peerConnectionRef.current && answer) {
          console.log("Setting remote description from answer");
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
          console.log("Remote description set successfully");
        } else {
          console.error("No peer connection or answer available");
        }
      } catch (err) {
        console.error("Error setting remote description:", err);
      }
    });

    socket.on("call-ended", () => {
      console.log("Call ended event received");
      toast.info("Call ended");
      endCall();
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      console.log("ICE candidate received:", candidate);
      try {
        if (peerConnectionRef.current) {
          if (peerConnectionRef.current.remoteDescription) {
            console.log("Adding ICE candidate");
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
            console.log("ICE candidate added successfully");
          } else {
            console.log("Queueing ICE candidate - no remote description yet");
            iceCandidatesQueue.current.push(candidate);
          }
        } else {
          console.error("No peer connection available for ICE candidate");
        }
      } catch (err) {
        console.error("Error handling ICE candidate:", err);
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
      console.log("Cleaning up socket event listeners");
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
            {contactUsername}
            <span className="statusIcons">
              {!isRemoteMicEnabled && <FaMicrophoneSlash />}
              {!isRemoteVideoEnabled && <FaVideoSlash />}
            </span>
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