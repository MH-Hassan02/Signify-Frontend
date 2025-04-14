import React from "react";
import heroImg from "../../images/hero.png";
import "./Hero.css";
import { Link } from "react-router-dom";

const Hero = () => {
  return (
    <>
      <div className="heroMain">
        <div className="heroTextBox">
          <div className="heroText">
            <h1>
              See the World Through <span>SIGNIFY.</span>
            </h1>
            <h3>Your Video Calls, Reimagined.</h3>
            <p>
              Break barriers and connect effortlessly with Signify. Experience
              next-gen video calls with crystal-clear visuals, seamless
              interactions, and innovative accessibility features—bringing
              people closer, no matter where they are.
            </p>
            <div className="heroBtns">
              <Link to="/calls">
                <button className="btn1">Make Your Call</button>
              </Link>
              <button className="btn2">Download the App</button>
            </div>
          </div>
        </div>
        <div className="heroImg">
          <img src={heroImg} alt="Call Image" />
        </div>
      </div>
    </>
  );
};

export default Hero;
