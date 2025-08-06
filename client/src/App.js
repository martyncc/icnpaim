import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import StudentDashboard from './components/StudentDashboard';
import AdminDashboard from './components/AdminDashboard';
import UnitView from './components/UnitView';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/student-dashboard" element={<StudentDashboard />} />
          <Route path="/admin-dashboard" element={<AdminDashboard />} />
          <Route path="/unit/:unitId" element={<UnitView />} />
          <Route path="/" element={<div>ICN PAIM - Accede desde Blackboard</div>} />
        </Routes>
      </div>
    </Router>
  );
}


export default App;