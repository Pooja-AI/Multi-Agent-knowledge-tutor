import { HashRouter, Routes, Route } from "react-router-dom";
import RECIPES from "./pages/MultiAgentCookBook";
import Navbar from "./components/Navbar";

function App() {
  return (
    <HashRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<RECIPES />} />
      </Routes>
    </HashRouter>
  );
}

export default App;