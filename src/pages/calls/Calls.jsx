import React, { useEffect, useState } from "react";
import "./Calls.css";
import Contacts from "../../components/contacts/Contacts";
import { useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import Chat from "../../components/chat/Chat";
import VideoCall from "../../components/videoCall/VideoCall";
import { useVideoCall } from "../../contexts/VideoCallContext";

const Calls = () => {
  const [selectedContact, setSelectedContact] = useState(null);
  const [videoCallActive, setVideoCallActive] = useState(false);
  const [mobileMode, setMobileMode] = useState(window.innerWidth <= 768);
  const { userInfo, loading } = useSelector((state) => state.user);
  const navigate = useNavigate();
  const location = useLocation();

  const { state } = location;
  const incomingCallData = state?.isIncomingCall && state?.selectedContact;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const handleResize = (e) => setMobileMode(e.matches);

    setMobileMode(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleResize);
    return () => mediaQuery.removeEventListener("change", handleResize);
  }, []);

  useEffect(() => {
    if (loading) return;

    if (!userInfo) {
      navigate("/login");
    }

    if (incomingCallData) {
      console.log(incomingCallData, "incomingCallData");
      setSelectedContact(state.selectedContact);
      setVideoCallActive(true);
    }
  }, [userInfo, loading, navigate, state]);

  useEffect(() => {
    console.log(selectedContact, "selectedContact");
    console.log(videoCallActive, "videoCallActive");
  }, []);

  const handleVideoCall = (contact) => {
    setSelectedContact(contact);
    setVideoCallActive(true);
    // setIncomingCall({ offer: null, from: contact._id }); // Set call state
  };

  const closeVideoCall = () => {
    setVideoCallActive(false);
  };

  return (
    <div className="callsContainer">
      <div
        className={`contactsSection ${
          mobileMode && selectedContact ? "mobileHidden" : ""
        } ${videoCallActive ? "callHide" : ""}`}
      >
        <Contacts onSelectContact={setSelectedContact} />
      </div>

      <div
        className={`chatSection ${
          mobileMode
            ? selectedContact
              ? "mobileChatSlideIn"
              : "mobileHidden"
            : ""
        } ${videoCallActive ? "callHide" : ""}`}
      >
        <Chat
          selectedContact={selectedContact}
          onVideoCall={handleVideoCall}
          onBack={() => setSelectedContact(null)} // Pass this to Chat for back icon
          mobileMode={mobileMode}
        />
      </div>

      <div className={`videoCallSection ${videoCallActive ? "" : "callHide"}`}>
        {videoCallActive && selectedContact && (
          <VideoCall
            currentUser={userInfo.userInfo}
            contactId={selectedContact._id}
            onClose={closeVideoCall}
            contactProfilePic={selectedContact.profilePic}
            contactUsername={selectedContact.username}
          />
        )}
      </div>
    </div>
  );
};

export default Calls;
