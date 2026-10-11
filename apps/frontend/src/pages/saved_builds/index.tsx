import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Loader2,
  PackagePlus,
  Pencil,
  Trash2,
  X,
  Check,
  ArrowRight,
  RotateCcw,
  Layers,
  Wallet,
  CalendarClock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatEstimatedPrice } from "@/lib/price"
import { EstimatedPriceNotice } from "@/components/estimated-price-notice"
import { hardwareService } from "@/services/hardware.service"
import type { Build } from "@/services/types"

const CATEGORY_LABEL: Record<string, string> = {
  ENTRY: "Entry",
  MID_RANGE: "Mid-Range",
  HIGH_END: "High-End",
  ULTRA: "Ultra",
  CUSTOM: "Custom",
}

function formatPrice(value: string | null): string {
  return formatEstimatedPrice(value)
}

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString("es-US", { day: "numeric", month: "short", year: "numeric" })
}

export default function MyBuildsPage() {
  const navigate = useNavigate()
  const [builds, setBuilds] = useState<Build[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const [editing, setEditing] = useState<Build | null>(null)
  const [editName, setEditName] = useState("")
  const [editDesc, setEditDesc] = useState("")
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    hardwareService
      .getBuilds({ categoria: "CUSTOM", limit: 100 })
      .then((data) => {
        if (cancelled) return
        setBuilds(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "No se pudieron cargar tus builds")
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  const retry = () => {
    setLoading(true)
    setError(null)
    setReload((r) => r + 1)
  }

  const openEdit = (build: Build) => {
    setEditing(build)
    setEditName(build.nombre)
    setEditDesc(build.descripcion ?? "")
    setEditError(null)
  }

  const saveEdit = async () => {
    if (!editing) return
    if (!editName.trim()) {
      setEditError("El nombre no puede estar vacío.")
      return
    }
    setSaving(true)
    setEditError(null)
    try {
      await hardwareService.updateBuild(editing.id, {
        nombre: editName.trim(),
        descripcion: editDesc.trim() || undefined,
      })
      setNotice(`Ensamble "${editName.trim()}" actualizado.`)
      setEditing(null)
      setReload((r) => r + 1)
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "No se pudo actualizar el ensamble")
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async (build: Build) => {
    if (deletingId) return
    setDeletingId(build.id)
    try {
      await hardwareService.deleteBuild(build.id)
      setNotice(`Ensamble "${build.nombre}" eliminado.`)
      setReload((r) => r + 1)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el ensamble")
    } finally {
      setDeletingId(null)
    }
  }

  const loadInSimulator = (build: Build) => {
    navigate("/simulator", {
      state: {
        buildName: build.nombre,
        componentIds: build.componentes.map((ec) => ec.componenteId),
      },
    })
  }

  const totalPrice = (build: Build) => formatPrice(build.precioTotal)

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <PackagePlus className="h-7 w-7 text-primary" />
          Mis Builds
        </h1>
        <p className="text-muted-foreground">
          Ensambles personalizados que guardaste desde el Simulador. Puedes editarlos o eliminarlos.
        </p>
        <EstimatedPriceNotice className="pt-1" />
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-400">
          <Check className="h-4 w-4" />
          {notice}
          <Button variant="ghost" size="sm" className="ml-auto h-7 w-7 p-0" onClick={() => setNotice(null)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={retry}>
            <RotateCcw className="h-4 w-4" />
            Reintentar
          </Button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando tus ensambles…
        </div>
      )}

      {!loading && !error && builds !== null && builds.length === 0 && (
        <Card className="border-dashed border-2 border-border/60 bg-muted/20">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <PackagePlus className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">Aún no has guardado ensambles</h3>
            <p className="mb-4 max-w-md text-sm text-muted-foreground">
              Arma una configuración en el Simulador y presiona “Guardar este Ensamble” para que aparezca aquí.
            </p>
            <Button onClick={() => navigate("/simulator")}>
              Ir al Simulador
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && builds !== null && builds.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          {builds.map((build) => (
            <Card key={build.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="truncate text-lg">{build.nombre}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {build.descripcion || "Ensamble personalizado"}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">{CATEGORY_LABEL[build.categoria] ?? build.categoria}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Layers className="h-3.5 w-3.5" /> {build.componentes.length} componentes
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" /> {formatDate(build.createdAt)}
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Wallet className="h-3.5 w-3.5 text-primary" /> {totalPrice(build)}
                  </div>
                </div>
                {build.componentes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {build.componentes.map((ec) => (
                      <Badge key={ec.id} variant="outline" className="text-[10px]">
                        {ec.componente.categoria.nombre}: {ec.componente.nombre}
                      </Badge>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button size="sm" variant="outline" onClick={() => openEdit(build)}>
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => confirmDelete(build)}
                    disabled={deletingId === build.id}
                  >
                    {deletingId === build.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Eliminar
                  </Button>
                  <Button size="sm" className="ml-auto" onClick={() => loadInSimulator(build)}>
                    Cargar en el Simulador
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-md border-border/60 bg-card shadow-xl">
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <Pencil className="h-5 w-5 text-primary" />
                  Editar ensamble
                </CardTitle>
                <CardDescription>Actualiza los datos de “{editing.nombre}”.</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => setEditing(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Nombre</span>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ej: Mi PC Gaming 1440p"
                  className={cn(
                    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus:border-primary",
                    editError && "border-destructive",
                  )}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Descripción (opcional)</span>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  placeholder="Notas sobre este ensamble…"
                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
                />
              </label>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={saving}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={saveEdit} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Guardar cambios
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}