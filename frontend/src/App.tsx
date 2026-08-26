import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./routes/ProtectedRoute";
import HealthCheck from "./pages/HealthCheck";
import Upload from "./pages/Upload";
import Documents from "./pages/Documents";
import DocumentViewer from "./pages/DocumentViewer";
import ExamEssentials from "./pages/ExamEssentials";
import Notebook from "./pages/Notebook";
import KnowledgeGraph from "./pages/KnowledgeGraph";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HealthCheck />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/documents/:id" element={<DocumentViewer />} />
        <Route path="/documents/:id/notebook" element={<Notebook />} />
        <Route path="/documents/:id/exam-essentials" element={<ExamEssentials />} />
        <Route path="/documents/:id/graph" element={<KnowledgeGraph />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
