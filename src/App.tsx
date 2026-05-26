import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { MyBody } from './pages/MyBody'
import { MyGame } from './pages/MyGame'
import { MyProtocol } from './pages/MyProtocol'
import { Chat } from './pages/Chat'
import { Settings } from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Protected routes — require auth */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/my-body"     element={<MyBody />} />
            <Route path="/my-game"     element={<MyGame />} />
            <Route path="/my-protocol" element={<MyProtocol />} />
            <Route path="/chat"        element={<Chat />} />
            <Route path="/settings"    element={<Settings />} />
          </Route>
        </Route>

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/my-body" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
