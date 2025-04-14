import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loginUser, googleSignIn } from "../../redux/slices/userSlice";
import { FaGoogle } from "react-icons/fa";
import logo from "../../images/logo.png";
import { auth, provider } from "../../firebase";
import { signInWithPopup } from "firebase/auth";
import { toast } from "react-toastify";
import "./Login.css";

const Login = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, userInfo, error } = useSelector((state) => state.user);

  useEffect(() => {
    if (userInfo) {
      toast.success("Login successful! Redirecting...");
      setTimeout(() => navigate("/"), 2000);
    }
  }, [userInfo, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(loginUser(formData));
  };

  const handleGoogleSignIn = async (e) => {
    e.preventDefault();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      dispatch(googleSignIn({ email: user.email, username: user.displayName }));
      toast.success("Google Sign-In Successful!");
    } catch (error) {
      toast.error("Google Sign-In Failed! Try again.");
    }
  };

  return (
    <>
      <div className="loginMain">
        <div className="loginTextContainer">
          <form className="loginForm" onSubmit={handleSubmit}>
            <div className="loginFormImg">
              <img src={logo} alt="Logo" />
            </div>
            <h1>Login</h1>
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
              autoComplete="current-password"
              required
            />
            <div className="loginButtonContainer">
              <p>
                Don't have an account?{" "}
                <span
                  onClick={() => navigate("/register")}
                  style={{ cursor: "pointer" }}
                >
                  Sign up now!
                </span>
              </p>
              <button type="submit" disabled={loading}>
                {loading ? "Logging in..." : "Login"}
              </button>
            </div>
            <p>By logging in, you agree to our terms and conditions.</p>
            <div className="loginOrContainer">
              <hr />
              <label>or</label>
            </div>
            <button className="googleBtn" onClick={handleGoogleSignIn}>
              <FaGoogle size={20} style={{ color: "#DB4437" }} />
              Login with Google
            </button>
          </form>
        </div>
      </div>
    </>
  );
};

export default Login;
