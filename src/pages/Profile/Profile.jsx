import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./Profile.css";
import { toast } from "react-toastify";

const Profile = () => {
  const [avatar, setAvatar] = useState(
    "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png"
  );
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarDelete, setAvatarDelete] = useState(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const navigate = useNavigate();
  const { userInfo, loading } = useSelector((state) => state.user);

  useEffect(() => {
    if (loading) return;

    if (!userInfo) {
      navigate("/login");
    } else {
      setUsername(userInfo.username || "");
      setEmail(userInfo.email || "");
      setStatusMessage(userInfo.statusMessage || "");
      setAvatar(userInfo.profilePic || avatar);
    }
  }, [userInfo, loading, navigate]);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    setAvatarFile(file);
    setAvatar(file);
    setAvatar(URL.createObjectURL(file));
  };

  const handleDeleteAvatar = (url) => {
    setAvatar(
      "https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png"
    );
    setAvatarFile(null);
    setAvatarDelete(url);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isUpdatingPassword) {
      if (newPassword.length < 8) {
        toast.error("Password must be at least 8 characters!");
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error("New and Confirm password do not match!");
        return;
      }
      if (currentPassword === newPassword) {
        toast.error("New password can't be the same as the old one!");
        return;
      }

      try {
        await axios.post(
          `${import.meta.env.VITE_BASE_URL}/auth/change-password`,
          {
            email: userInfo.email,
            oldPassword: currentPassword,
            newPassword,
          },
          { withCredentials: true }
        );
        toast.success("Password updated!");
      } catch (error) {
        toast.error(error.response.data.message);
        return;
      }
    }

    try {
      let updatedProfilePic = avatar;

      if (avatarDelete) {
        console.log(avatarDelete, "avatarDelete");
        await axios.delete(
          `${import.meta.env.VITE_BASE_URL}/upload/profilePic`,
          {
            data: { userId: userInfo._id },
            withCredentials: true,
          }
        );
      }

      if (avatarFile) {
        console.log(avatarFile, "avatarFile");
        const formData = new FormData();
        formData.append("userId", userInfo._id);
        formData.append("profilePic", avatarFile);

        const response = await axios.post(
          `${import.meta.env.VITE_BASE_URL}/upload/profilePic`,
          formData,
          {
            headers: {
              "Content-Type": "multipart/form-data",
            },
            withCredentials: true,
          }
        );

        updatedProfilePic = response.data.imageUrl;
      }

      await axios.put(
        `${import.meta.env.VITE_BASE_URL}/auth/profile/${userInfo._id}`,
        {
          username,
          statusMessage,
          profilePic: updatedProfilePic,
        },
        { withCredentials: true }
      );

      toast.success("Profile updated!");
     } catch (error) {
      console.error(error);
      toast.error(error.response.data.message);
    }
  };

  return (
    <div className="profileEditContainer">
      <form onSubmit={handleSubmit} className="editProfileForm">
        <div className="avatarSection">
          <img src={avatar} alt="avatar" className="avatarImage" />
          <div className="avatarButtons">
            <input
              type="file"
              id="uploadAvatar"
              onChange={handleUpload}
              className="profileInputHidden"
            />
            <label htmlFor="uploadAvatar" className="uploadBtn">
              Upload New
            </label>
            <button
              type="button"
              className="deleteBtn"
              onClick={() => handleDeleteAvatar(userInfo?.profilePic)}
            >
              Delete Avatar
            </button>
          </div>
        </div>

        <div className="formGrid">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
          />
          <input type="email" value={email} disabled placeholder="Email" />
          <input
            type="text"
            value={statusMessage}
            onChange={(e) => setStatusMessage(e.target.value)}
            placeholder="Status Message"
          />
        </div>

        <div className="checkbox">
          <input
            type="checkbox"
            checked={isUpdatingPassword}
            onChange={() => setIsUpdatingPassword(!isUpdatingPassword)}
          />
          <label>Update Password</label>
        </div>

        {isUpdatingPassword && (
          <div className="formGrid">
            <input
              type="password"
              placeholder="Current Password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        )}

        <div className="submitContainer">
          <button type="submit" className="saveChangesBtn">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
};

export default Profile;
