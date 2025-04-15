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
import { useNavigate } from "react-router-dom";

const VideoCall = ({
  currentUser,
  contactId,
  contactProfilePic,
  contactUsername,
  onClose,
}) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const [remoteStreamAvailable, setRemoteStreamAvailable] = useState(false);

  const { incomingCall, setIncomingCall, isCalling, setIsCalling } =
    useVideoCall();
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);

  const navigate = useNavigate()

  const servers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

  const setupPeerConnection = (stream) => {
    const pc = new RTCPeerConnection(servers);
    peerConnectionRef.current = pc;

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      remoteVideoRef.current.srcObject = remoteStream;
      setRemoteStreamAvailable(true);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          to: contactId,
          candidate: event.candidate,
        });
      }
    };

    return pc;
  };

  const startCall = async () => {
    try {
      setIsCalling(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;

      const pc = setupPeerConnection(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("call-user", {
        to: contactId,
        offer,
        from: currentUser,
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to start call.");
    }
  };

  const acceptCall = async () => {
    try {
      setIsCalling(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      localVideoRef.current.srcObject = stream;

      const pc = setupPeerConnection(stream);
      await pc.setRemoteDescription(
        new RTCSessionDescription(incomingCall.offer)
      );
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answer-call", {
        to: contactId,
        answer,
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to accept call.");
    }
  };

  const endCall = () => {
    socket.emit("end-call", { to: contactId });

    peerConnectionRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());

    setIsCalling(false);
    setIncomingCall(null);
    setRemoteStreamAvailable(false);
    onClose?.();
    navigate("/calls", { replace: true });
  };

  useEffect(() => {
    socket.on("call-accepted", ({ answer }) => {
      peerConnectionRef.current?.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    });

    socket.on("call-ended", () => {
      toast.info("Call ended");
      endCall();
    });

    socket.on("ice-candidate", ({ candidate }) => {
      peerConnectionRef.current?.addIceCandidate(
        new RTCIceCandidate(candidate)
      );
    });

    return () => {
      socket.off("call-accepted");
      socket.off("call-ended");
      socket.off("ice-candidate");
      endCall();
    };
  }, [contactId]);

  useEffect(() => {
    if (incomingCall && incomingCall.from._id === contactId && !isCalling) {
      acceptCall();
    } else if (!incomingCall && !isCalling && contactId) {
      startCall();
    }
  }, [incomingCall]);

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()?.[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMicOn(track.enabled);
    }
  };

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()?.[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsVideoOn(track.enabled);
    }
  };

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
              muted
            />
          )}
          <p className="contactNameVideo">
            {currentUser?.username} {!isMicOn && <FaMicrophoneSlash />}
          </p>
        </div>

        <div className="videoSlot">
          {!remoteStreamAvailable ? (
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
            />
          )}
          <p className="contactNameVideo">{contactUsername}</p>
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
