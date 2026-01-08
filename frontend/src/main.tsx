import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./components/AuthContext";
import { getLocale, setLocale } from "./utils/localization";
import { applyTheme, getThemePreference } from "./utils/theme";
import "./styles.css";

const themePreference = getThemePreference();
applyTheme(themePreference);
setLocale(getLocale());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
