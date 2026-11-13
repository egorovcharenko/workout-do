"use client";

import { getExerciseImage } from "./icons";

/**
 * Exercise artwork, either a standalone file or one cell of a 3-column sprite
 * sheet. The sprite maths matches the legacy `getExerciseIcon` markup: the
 * sheet is blown up to 300% width inside a square window and shifted by whole
 * cells, so one cell fills the frame.
 */
function ExerciseImage({ name, rounded = 8 }) {
  const image = getExerciseImage(name);
  if (!image) return null;

  const frame = {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1",
    overflow: "hidden",
    borderRadius: rounded,
    background: "#fff",
  };

  if (typeof image === "string") {
    return (
      <div style={frame}>
        <img
          src={image}
          alt=""
          aria-hidden
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      </div>
    );
  }

  return (
    <div style={frame}>
      <img
        src={image.src}
        alt=""
        aria-hidden
        style={{
          position: "absolute",
          width: "300%",
          maxWidth: "none",
          height: `${image.height}%`,
          left: `-${image.column * 100}%`,
          top: `-${image.row * 100}%`,
          display: "block",
        }}
      />
    </div>
  );
}

/** True when there is artwork to show, so callers can skip the toggle. */
function hasExerciseImage(name) {
  return !!getExerciseImage(name);
}

export { ExerciseImage, hasExerciseImage };
