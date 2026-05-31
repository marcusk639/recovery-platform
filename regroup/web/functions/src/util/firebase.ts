import axios from "axios";

export const warmWebServer = () => {
  return axios.get("https://rats-dev.web.app/pricing");
};
