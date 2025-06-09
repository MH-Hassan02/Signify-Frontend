import React from "react";
import moment from "moment";
import "./ContactCard.css";

function formatContactTime(date) {
  const m = moment(date);
  if (m.isSame(moment(), 'day')) {
    return m.format('hh:mm A');
  } else if (m.isSame(moment().subtract(1, 'day'), 'day')) {
    return 'Yesterday';
  } else {
    return m.format('D MMM, YYYY');
  }
}

const ContactCard = ({
  contact,
  isSelected,
  onClick,
  lastMessage,
  unreadCount,
  lastMessageTime,
}) => {
  // console.log(lastMessageTime, "lastMessageTime")
  const formattedTime = lastMessageTime
    ? formatContactTime(lastMessageTime)
    : "";

  // console.log(formattedTime, "formattedTime")

  return (
    <div
      className={`contactCard ${isSelected ? "active" : ""}`}
      onClick={onClick}
    >
      <div className="avatar">
        <img src={contact.profilePic} alt="Avatar" />
      </div>
      <div className="contactInfo">
        <h4>{contact.username}</h4>
        <p>{lastMessage || contact.statusMessage}</p>
      </div>

      <div className="contactMeta">
        {lastMessageTime && (
          <div
            className={`messageTimeContacts ${
              unreadCount > 0 ? "smallTime" : ""
            }`}
          >
            {formattedTime}
          </div>
        )}
        {unreadCount > 0 && <div className="unreadBadge">{unreadCount}</div>}
      </div>
    </div>
  );
};

export default ContactCard;
