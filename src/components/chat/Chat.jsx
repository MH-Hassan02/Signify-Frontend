import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import moment from "moment";
import { FaVideo, FaSearch, FaArrowDown } from "react-icons/fa";
import { MdSend } from "react-icons/md";
import { AiOutlineArrowLeft } from "react-icons/ai";
import { toast } from "react-toastify";
import ChatPlaceholder from "./ChatPlaceholder";
import socket from "../../socket";
import { useVideoCall } from "../../contexts/VideoCallContext";
import IncomingCallPopup from "./IncomingCallPopup";
import "./Chat.css";

const Chat = ({ selectedContact, onVideoCall, onBack, mobileMode }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [someoneTyping, setSomeoneTyping] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const chatMessagesRef = useRef(null);
  const messagesEndRef = useRef(null);
  const currentUser = useSelector((state) => state.user.userInfo);
  const { incomingCall, setIncomingCall, isCalling } = useVideoCall();

  useEffect(() => {
    socket.emit("setup", currentUser);
  }, [currentUser]);

  useEffect(() => {
    const fetchMessages = async () => {
      if (selectedContact) {
        try {
          const res = await axios.get(
            `${import.meta.env.VITE_BASE_URL}/messages/${currentUser._id}/${
              selectedContact._id
            }`,
            { withCredentials: true }
          );
          setMessages(res.data);

          await axios.put(
            `${import.meta.env.VITE_BASE_URL}/messages/markAsRead`,
            { senderId: selectedContact._id, receiverId: currentUser._id },
            { withCredentials: true }
          );
        } catch (error) {
          toast.error("Error fetching messages");
        }
      }
    };

    fetchMessages();
  }, [selectedContact, messages]);

  useEffect(() => {
    console.log(selectedContact, "selectedContact");
    socket.on("typing", ({ from }) => {
      if (from === selectedContact._id) {
        console.log("Typing bubble actuve");
        setSomeoneTyping(true);
      }
    });

    socket.on("stop typing", ({ from }) => {
      if (from === selectedContact._id) {
        console.log("Typing bubble stopping");
        setSomeoneTyping(false);
      }
    });

    return () => {
      socket.off("typing");
      socket.off("stop typing");
    };
  }, [selectedContact]);

  useEffect(() => {
    if (input.trim()) {
      setIsTyping(true);
      socket.emit("typing", {
        from: currentUser._id,
        to: selectedContact?._id,
      });
    } else {
      setIsTyping(false);
      if (selectedContact) {
        socket.emit("stop typing", {
          from: currentUser._id,
          to: selectedContact?._id,
        });
      }
    }
  }, [input]);

  useEffect(() => {
    const chatContainer = chatMessagesRef.current;

    const handleScroll = () => {
      if (!chatContainer) return;
      const isAtBottom =
        chatContainer.scrollHeight - chatContainer.scrollTop ===
        chatContainer.clientHeight;
      setShowScrollToBottom(!isAtBottom);
    };

    if (chatContainer) {
      chatContainer.addEventListener("scroll", handleScroll);
    }

    return () => {
      if (chatContainer) {
        chatContainer.removeEventListener("scroll", handleScroll);
      }
    };
  }, [chatMessagesRef.current]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    try {
      const res = await axios.post(
        `${import.meta.env.VITE_BASE_URL}/chats`,
        {
          userId: currentUser._id,
          secondUserId: selectedContact._id,
        },
        { withCredentials: true }
      );

      const chatId = res.data._id;

      const newMsg = {
        text: input,
        sender: { _id: currentUser._id },
        receiver: selectedContact._id,
        chatId: chatId,
        time: new Date().toLocaleTimeString(),
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, newMsg]);
      setInput("");

      await axios.post(`${import.meta.env.VITE_BASE_URL}/messages`, newMsg, {
        withCredentials: true,
      });

      socket.emit("new message", newMsg);
      socket.emit("stop typing", {
        from: currentUser._id,
        to: selectedContact._id,
      });
    } catch (err) {
      toast.error("Error sending message");
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

    const markAsRead = async () => {
      if (selectedContact) {
        try {
          await axios.put(
            `${import.meta.env.VITE_BASE_URL}/messages/markAsRead`,
            { senderId: selectedContact._id, receiverId: currentUser._id },
            { withCredentials: true }
          );
        } catch (error) {
          toast.error("Error Reading messages");
        }
      }
    };

    markAsRead();
  }, [messages, someoneTyping]);

  useEffect(() => {
    socket.on("message received", (newMsg) => {
      if (
        newMsg.sender._id === selectedContact._id ||
        newMsg.receiver === selectedContact._id
      ) {
        setMessages((prev) => [...prev, newMsg]);
      }
    });

    return () => {
      socket.off("message received");
    };
  }, [selectedContact]);

  return (
    <div className="chatMain">
      {selectedContact ? (
        <>
          <div className="chatHeader">
            <div className="headerLeft">
              {mobileMode && (
                <AiOutlineArrowLeft
                  size={22}
                  onClick={onBack}
                  style={{ cursor: "pointer" }}
                />
              )}
              <img
                src={selectedContact.profilePic}
                alt="Profile"
                className="profilePic"
              />
              <span className="contactName">{selectedContact.username}</span>
            </div>
            <div className="headerRight">
              <FaVideo
                className="videoCallIcon"
                onClick={() => onVideoCall(selectedContact)}
              />
              <FaSearch className="searchIcon" />
            </div>
          </div>

          <div className="chatMessages" ref={chatMessagesRef}>
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`chatBubble ${
                  msg.sender._id === currentUser._id ? "me" : "them"
                }`}
              >
                <div>{msg.text}</div>
                <div className="messageTime">
                  {moment(msg.createdAt).format("HH:mm")}
                </div>
              </div>
            ))}

            {someoneTyping && (
              <div className="chatBubble them typing">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {showScrollToBottom && (
            <button className="scrollToBottomBtn" onClick={scrollToBottom}>
              <FaArrowDown />
            </button>
          )}

          <div className="chatInputArea">
            <input
              type="text"
              placeholder="Type a message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button onClick={sendMessage}>
              <MdSend size={20} />
            </button>
          </div>

          {incomingCall && !isCalling && <IncomingCallPopup />}
        </>
      ) : (
        <ChatPlaceholder />
      )}
    </div>
  );
};

export default Chat;
