import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { logoutUser } from "../../redux/slices/userSlice";
import { FiHome, FiInfo, FiUser, FiLogOut } from "react-icons/fi";
import { HiOutlineVideoCamera } from "react-icons/hi";
import "./BottomNav.css";
import { BiEdit } from "react-icons/bi";

const BottomNav = () => {
  const userInfo = useSelector((state) => state.user.userInfo);
  const [showSignOut, setShowSignOut] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleProfile = () => {
    setShowSignOut(false);
    navigate("/profile");
  };

  const handleLogout = () => {
    dispatch(logoutUser());
  };

  return (
    <div className="bottomNav">
      <Link to="/" className="navItem">
        <FiHome size={24} />
        <span className="navText">Home</span>
      </Link>

      <a href="https://6000-firebase-studio-1748800724016.cluster-w5vd22whf5gmav2vgkomwtc4go.cloudworkstations.dev/" className="navItem">
        <FiInfo size={24} />
        <span className="navText">Standalone</span>
      </a>

      <Link to="/calls" className="navItem">
        <HiOutlineVideoCamera size={24} />
        <span className="navText">Start Call</span>
      </Link>

      {userInfo ? (
        <div
          className="navItem profileWrapper"
          onClick={() => setShowSignOut(!showSignOut)}
        >
          <div className="navItem">
            <div className="profileIcon">
              <img
                src={userInfo.profilePic || "https://picsum.photos/200/200"}
                alt="Profile"
                className="profileImage"
              />
            </div>
            <span className="navText">{userInfo.username || "Profile"}</span>
          </div>
          {showSignOut && (
            <div className="signOutBtnContainer">
              <div className="signOutBtn" onClick={handleProfile}>
                <BiEdit size={20} />
                <span>Edit Profile</span>
              </div>
              <div className="signOutBtn" onClick={handleLogout}>
                <FiLogOut size={20} />
                <span>Sign Out</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <Link to="/login" className="navItem">
          <FiUser size={24} />
          <span className="navText">Sign In</span>
        </Link>
      )}
    </div>
  );
};

export default BottomNav;
