import React from "react";
import "./ChatMessagesSkeleton.css";

const skeletons = [
  { align: "left", width: "40%", height: "96px" },
  { align: "right", width: "35%", height: "112px" },
  { align: "left", width: "45%", height: "88px" },
  { align: "right", width: "50%", height: "104px" },
  { align: "left", width: "38%", height: "108px" },
];

const ChatMessagesSkeleton = () => (
  <div className="chatMessagesSkeleton">
    {skeletons.map((s, i) => (
      <div
        key={i}
        className={`skeletonBubble ${s.align}`}
        style={{ width: s.width, height: s.height }}
      >
        <div className="skeletonShimmer" />
      </div>
    ))}
  </div>
);

export default ChatMessagesSkeleton; 