import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hayagriva",
    short_name: "Hayagriva",
    description: "Smarter Roads. A Wiser Tomorrow.",
    start_url: "/",
    display: "standalone",
    background_color: "#F7F4EF",
    theme_color: "#1B3A2F",
  };
}
