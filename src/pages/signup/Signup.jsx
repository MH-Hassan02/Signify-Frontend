import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { registerUser, googleSignIn } from "../../redux/slices/userSlice";
import { FaGoogle } from "react-icons/fa";
import logo from "../../images/logo.png";
import { auth, provider } from "../../firebase";
import { signInWithPopup } from "firebase/auth";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./Signup.css";

const Signup = () => {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, userInfo, error } = useSelector((state) => state.user);

  useEffect(() => {
    if (userInfo) {
      toast.success("Signup successful! Redirecting...");
      setTimeout(() => navigate("/"), 2000);
    }
  }, [userInfo, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match!");
      return;
    }
    dispatch(registerUser(formData));
  };

  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      dispatch(
        googleSignIn({
          email: user.email,
          username: user.displayName,
          googleId: user.uid,
          profilePic: user.photoURL,
        })
      );
    } catch (error) {
      toast.error("Google Sign-In Failed! Try again.");
    }
  };

  return (
    <>
      <div className="signupMain">
        <div className="signupTextContainer">
          <form className="signupForm" onSubmit={handleSubmit}>
            <div className="signupFormImg">
              <img src={logo} alt="Logo" />
            </div>
            <h1>Sign up</h1>
            <input
              type="text"
              name="username"
              placeholder="Enter Username"
              value={formData.username}
              onChange={handleChange}
              required
            />
            <input
              type="email"
              name="email"
              placeholder="Enter Email Address"
              value={formData.email}
              onChange={handleChange}
              required
            />
            <input
              type="password"
              name="password"
              placeholder="Enter Password"
              value={formData.password}
              onChange={handleChange}
              autoComplete="new-password"
              required
            />
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm Password"
              value={formData.confirmPassword}
              onChange={handleChange}
              autoComplete="new-password"
              required
            />
            <div className="signupButtonContainer">
              <p>
                Already have an account?{" "}
                <span
                  onClick={() => navigate("/login")}
                  style={{ cursor: "pointer" }}
                >
                  Log in now!
                </span>
              </p>
              <button type="submit" disabled={loading}>
                {loading ? "Signing Up..." : "Sign up"}
              </button>
            </div>
            <p>By clicking on signup, you agree to our terms and conditions.</p>
            <div className="signupOrContainer">
              <hr />
              <label>or</label>
            </div>
            <button className="googleBtn" onClick={handleGoogleSignIn}>
              <FaGoogle size={20} style={{ color: "#DB4437" }} />
              Sign up with Google
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default Signup;
