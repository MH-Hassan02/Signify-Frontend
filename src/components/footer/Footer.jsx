import React from "react";
import "./Footer.css";
import { FaFacebook, FaTwitter, FaInstagram, FaLinkedin } from "react-icons/fa";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="footerContainer">
      <div className="footerContent">
        <div className="footerLinks">
          <Link to="/about" className="footerLink">About Us</Link>
          <Link to="/contact" className="footerLink">Contact</Link>
          <Link to="/privacy" className="footerLink">Privacy Policy</Link>
          <Link to="/terms" className="footerLink">Terms of Service</Link>
        </div>

        <div className="socialIcons">
          <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="socialLink">
            <FaFacebook />
          </a>
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="socialLink">
            <FaTwitter />
          </a>
          <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="socialLink">
            <FaInstagram />
          </a>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="socialLink">
            <FaLinkedin />
          </a>
        </div>
      </div>

      <div className="footerBottom">
        <p>© {new Date().getFullYear()} Signify. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;
