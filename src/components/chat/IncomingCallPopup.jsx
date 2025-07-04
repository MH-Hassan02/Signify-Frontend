import React, { useEffect, useRef, useState } from "react";
import { useVideoCall } from "../../contexts/VideoCallContext";
import { useNavigate } from "react-router-dom";
import socket from "../../socket";
import { toast } from "react-toastify";
import "./IncomingCallPopup.css";

const IncomingCallPopup = () => {
  const { incomingCall, setIncomingCall, setIsCalling } = useVideoCall();
  const navigate = useNavigate();
  const ringtoneRef = useRef(null);
  const autoRejectTimeoutRef = useRef(null);
  const [isRingtonePlaying, setIsRingtonePlaying] = useState(false);

  useEffect(() => {
    if (incomingCall) {
      const ringtone = ringtoneRef.current;
      if (ringtone && !isRingtonePlaying) {
        setIsRingtonePlaying(true);
        ringtone.play().catch((err) =>
          console.warn("Failed to play ringtone:", err)
        );
      }

      // Auto reject after 30 seconds
      autoRejectTimeoutRef.current = setTimeout(() => {
        handleReject();
        toast.info("Call timed out.");
      }, 30000);

      // Listen for call cancellation
      const handleCallEnded = () => {
        console.log("Call ended by caller");
        if (ringtone) {
          ringtone.pause();
          ringtone.currentTime = 0;
          setIsRingtonePlaying(false);
        }
        setIncomingCall(null);
        toast.info("Caller ended the call");
      };

      socket.on("call-ended", handleCallEnded);

      return () => {
        clearTimeout(autoRejectTimeoutRef.current);
        if (ringtone) {
          ringtone.pause();
          ringtone.currentTime = 0;
          setIsRingtonePlaying(false);
        }
        socket.off("call-ended", handleCallEnded);
      };
    }
  }, [incomingCall]);

  if (!incomingCall) return null;

  const handleAccept = async () => {
    try {
      setIsCalling(true);

      // Store the offer before clearing incomingCall
      const callData = {
        offer: incomingCall.offer,
        from: incomingCall.from
      };

      setIncomingCall(null);

      const selectedContact = {
        _id: incomingCall.from._id,
        profilePic: incomingCall.from.profilePic,
        username: incomingCall.from.username,
      };

      // Pass the offer in the navigation state
      navigate("/calls", {
        state: { 
          selectedContact, 
          isIncomingCall: true,
          callData  // Pass the offer and caller info
        },
      });

      console.log("Call accepted, navigating to the call screen with offer data");
    } catch (err) {
      console.error("Error accepting the call:", err);
      toast.error("Failed to accept call.");
    }
  };

  const handleReject = () => {
    if (incomingCall?.from) {
      socket.emit("end-call", { to: incomingCall.from._id });
    }
    setIncomingCall(null);
  };

  return (
    <div className="incomingCallPopup">
      <audio ref={ringtoneRef} src="/ringtone.mp3" loop />
      <p>📞 Incoming call from {incomingCall.from.username}</p>
      <button onClick={handleAccept} className="acceptButton">
        Accept
      </button>
      <button onClick={handleReject} className="rejectButton">
        Reject
      </button>
    </div>
  );
};

export default IncomingCallPopup;
