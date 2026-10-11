import { Outlet, useLocation } from "react-router-dom"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { AmbientBackground } from "./ambient-background"
import { SECTION_THEMES, sectionForPath, sectionVars } from "@/lib/section-theme"

export function Layout() {
  const location = useLocation()
  const theme = SECTION_THEMES[sectionForPath(location.pathname)]

  return (
    <div
      className="app-shell relative flex h-screen overflow-hidden bg-background"
      style={sectionVars(theme)}
      data-section={theme.key}
    >
      <AmbientBackground />
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
