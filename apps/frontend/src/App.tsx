import { useState } from "react"
import { createBrowserRouter, RouterProvider } from "react-router-dom"
import { Layout } from "@/components/layout/layout"
import { SplashScreen } from "@/components/splash-screen"
import DashboardPage from "@/pages/dashboard"
import BuilderPage from "@/pages/builder"
import BuildsPage from "@/pages/builds"
import SavedBuildsPage from "@/pages/saved_builds"
import ScannerPage from "@/pages/scanner"
import ComparatorPage from "@/pages/comparator"
import PsuCalculatorPage from "@/pages/psu_calculator"
import FpsPage from "@/pages/fps"
import MonitorPage from "@/pages/monitor"
import "./App.css"

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "simulator",
        element: <BuilderPage />,
      },
      {
        path: "builds",
        element: <BuildsPage />,
      },
      {
        path: "mis-builds",
        element: <SavedBuildsPage />,
      },
      {
        path: "scanner",
        element: <ScannerPage />,
      },
      {
        path: "psu",
        element: <PsuCalculatorPage />,
      },
      {
        path: "versus",
        element: <ComparatorPage />,
      },
      {
        path: "fps",
        element: <FpsPage />,
      },
      {
        path: "monitor",
        element: <MonitorPage />,
      },
    ],
  },
])

function App() {
  const [showSplash, setShowSplash] = useState(true)

  return (
    <>
      <RouterProvider router={router} />
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
    </>
  )
}

export default App
