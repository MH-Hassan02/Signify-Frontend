import React, { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { logoutUser } from "../../redux/slices/userSlice";
import { FiChevronDown } from "react-icons/fi";
import Logo from "../../images/logo.png";
import "./Navbar.css";

const Navbar = () => {
  const userInfo = useSelector((state) => state.user.userInfo);
  const [showLogout, setShowLogout] = useState(false);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleProfile = () => {
    setShowLogout(false);
    navigate("/profile");
  };

  const handleLogout = () => {
    dispatch(logoutUser());
    setShowLogout(false); // Close dropdown after logout
  };

  return (
    <div className="navMain">
      <div className="navLogo">
        <img src={Logo} alt="Logo" />
      </div>
      <div className="navLinks">
        <Link to="/">Home</Link>
        <Link to="/calls">Calls</Link>
        <a href="https://6000-firebase-studio-1748800724016.cluster-w5vd22whf5gmav2vgkomwtc4go.cloudworkstations.dev/">Standalone</a>
        <Link to="/">Our Services</Link>
        <Link to="/">Contact Us</Link>
      </div>
      {userInfo ? (
        <div className="profileContainer">
          <div className="profileImg">
            <img
              src={userInfo.profilePic || "https://picsum.photos/200/200"}
              alt="Profile"
            />
          </div>
          <div
            className="profileName"
            onClick={() => setShowLogout(!showLogout)}
          >
            <label>{userInfo.username || "User"}</label>
            <FiChevronDown className="dropdownArrow" />
          </div>
          {showLogout && (
            <div className="logoutButtonContainer">
              <button className="logoutButton" onClick={handleProfile}>
                Edit Profile
              </button>
              <button className="logoutButton" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="navAuth">
          <Link to="/login">
            <button className="btn1">Login</button>
          </Link>
          <Link to="/register">
            <button className="btn2">Sign up</button>
          </Link>
        </div>
      )}
    </div>
  );
};

export default Navbar;
