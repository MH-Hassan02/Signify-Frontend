import { useEffect, useState } from "react";
import axios from "axios";
import { FiSearch } from "react-icons/fi";
import { FaHome, FaPlus } from "react-icons/fa";
import ContactCard from "../contactCard/ContactCard";
import "./Contacts.css";
import { toast } from "react-toastify";
import socket from "../../socket"; // ✅ use the shared instance
import { Link } from "react-router-dom";

const Contacts = ({ onSelectContact }) => {
  const [contacts, setContacts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchContacts = async () => {
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_BASE_URL}/contacts/getAll`,
        {
          withCredentials: true,
        }
      );

      setContacts([
        ...res.data.contactsWithMessages,
        ...(res.data.contactsWithoutMessages || []),
      ]);
    } catch (err) {
      console.error("Fetch contacts error:", err);
      toast.error("Could not load contacts.");
    }
  };

  useEffect(() => {
    fetchContacts();

    // console.log("📡 Setting up socket listener for 'message received'");

    const handleMessageReceived = (newMessage) => {
      // console.log("📥 Received message on socket:", newMessage);

      setContacts((prevContacts) =>
        prevContacts.map((contact) => {
          const isSender = newMessage.sender === contact._id;
          const isReceiver = newMessage.receiver === contact._id;

          if (isSender || isReceiver) {
            const updatedContact = { ...contact };
            updatedContact.lastMessage = newMessage.text;
            updatedContact.lastMessageTime = newMessage.lastMessageTime;

            if (isSender) {
              updatedContact.unreadCountForReceiver =
                (updatedContact.unreadCountForReceiver || 0) + 1;
            }

            return updatedContact;
          }

          return contact;
        })
      );
    };

    socket.on("message received", handleMessageReceived);

    return () => {
      // console.log("🧹 Cleaning up socket listener");
      socket.off("message received", handleMessageReceived);
    };
  }, [contacts]);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    setLoading(true);

    try {
      const res = await axios.get(
        `${
          import.meta.env.VITE_BASE_URL
        }/contacts/users/search?query=${searchTerm}`,
        { withCredentials: true }
      );
      setSearchResults([res.data]);
    } catch (err) {
      console.error("Search error:", err);
      toast.error(err.response.data.msg);
    } finally {
      setLoading(false);
    }
  };

  const handleAddContact = async (userId) => {
    try {
      const res = await axios.post(
        `${import.meta.env.VITE_BASE_URL}/contacts/add`,
        { userId },
        { withCredentials: true }
      );

      if (res.data.success && res.data.updatedUser.contacts) {
        toast.success("Contact Added");
        await fetchContacts();
        setShowModal(false);
        setSearchResults([]);
        setSearchTerm("");
      } else {
        toast.error(res.data.msg || "Could not add contact");
      }
    } catch (err) {
      toast.error("Add contact error:", err);
    }
  };

  return (
    <div className="contactsMain">
      <div className="contactHead">
        <Link to="/">
          <FaHome size={24} style={{ cursor: "pointer", color: "white" }} />
        </Link>
        <h2>Chats</h2>
        <div className="newContact" onClick={() => setShowModal(true)}>
          <FaPlus />
        </div>
      </div>

      <div className="contactsSearch">
        <div className="searchBox">
          <FiSearch />
          <input
            type="text"
            placeholder="Search or start a new chat"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="contactsList">
        <div className="contactCardContainer">
          {contacts.map((contact) => (
            <ContactCard
              key={contact._id}
              contact={contact}
              onClick={() => onSelectContact(contact)}
              lastMessage={contact.lastMessage}
              lastMessageTime={contact.lastMessageTime}
              unreadCount={contact.unreadCountForReceiver}
            />
          ))}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal">
          <div className="modalContent">
            <h3>Add Contact</h3>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Enter email, username, or ID"
            />
            <button
              className="btnSearch"
              onClick={handleSearch}
              disabled={loading}
            >
              {loading ? "Searching..." : "Search"}
            </button>

            {searchResults.length > 0 && (
              <div className="results">
                {searchResults.map((user) => (
                  <div key={user._id} className="userCard">
                    <img
                      src={user.profilePic}
                      alt="profile"
                      className="profilePic"
                    />
                    <div>
                      <h4>{user.username}</h4>
                      <p>{user.email}</p>
                    </div>
                    <button onClick={() => handleAddContact(user._id)}>
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button className="closeBtn" onClick={() => setShowModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contacts;
