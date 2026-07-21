export const API_MODE = import.meta.env.VITE_API_MODE === "mock" ? "mock" : "http";
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

