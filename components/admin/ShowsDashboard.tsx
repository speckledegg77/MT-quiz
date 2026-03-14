"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"

type ShowItem = {
  show_key: string
  display_name: string
  alt_names: unknown
  is_active: boolean
  created_at?: string
  updated_at?: string
}

type ShowsResponse = {
  ok: true
  shows: ShowItem[]
}

type AddShowState = {
  displayName: string
  showKey: string
  altNamesText: string
  isActive: boolean
}

type EditShowState = {
  displayName: string
  altNamesText: string
  isActive: boolean
}

function buildAdminHeaders(token: string) {
  return {
    "x-admin-token": token.trim(),
  }
}

function toAltNamesArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? "").trim()).filter(Boolean)
}

function toAltNamesText(value: unknown) {
  return toAltNamesArray(value).join("\n")
}

function parseAltNamesText(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

function normaliseShowKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
}

export function ShowsDashboard() {
  const [token, setToken] = useState("")
  const cleanToken = token.trim()

  const [search, setSearch] = useState("")
  const [shows, setShows] = useState<ShowItem[]>([])
  const [listBusy, setListBusy] = useState(false)
  const [listError, setListError] = useState("")

  const [selectedShowKey, setSelectedShowKey] = useState("")
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveResult, setSaveResult] = useState("")
  const [createBusy, setCreateBusy] = useState(false)
  const [createResult, setCreateResult] = useState("")

  const [addShow, setAddShow] = useState<AddShowState>({
    displayName: "",
    showKey: "",
    altNamesText: "",
    isActive: true,
  })

  const [editShow, setEditShow] = useState<EditShowState>({
    displayName: "",
    altNamesText: "",
    isActive: true,
  })

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("mtq_admin_token") ?? ""
      if (saved) setToken(saved)
    } catch {
      // ignore
    }
  }, [])

  async function loadShows(nextSelectedShowKey?: string) {
    if (!cleanToken) {
      setListError("Enter your admin token first.")
      setShows([])
      return
    }

    setListBusy(true)
    setListError("")
    setSaveResult("")
    setCreateResult("")

    try {
      try {
        sessionStorage.setItem("mtq_admin_token", cleanToken)
      } catch {
        // ignore
      }

      const res = await fetch("/api/admin/shows", {
        headers: buildAdminHeaders(cleanToken),
        cache: "no-store",
      })

      const json = (await res.json()) as ShowsResponse | { error?: string }

      if (!res.ok) {
        setShows([])
        setListError((json as { error?: string }).error || "Could not load shows.")
        return
      }

      const nextShows = (json as ShowsResponse).shows || []
      setShows(nextShows)

      const targetKey =
        nextSelectedShowKey ||
        selectedShowKey ||
        (nextShows.length ? nextShows[0]?.show_key : "")

      if (targetKey && nextShows.some((show) => show.show_key === targetKey)) {
        selectShow(nextShows.find((show) => show.show_key === targetKey)!)
      } else {
        setSelectedShowKey("")
        setEditShow({
          displayName: "",
          altNamesText: "",
          isActive: true,
        })
      }
    } catch (error: any) {
      setShows([])
      setListError(error?.message || "Could not load shows.")
    } finally {
      setListBusy(false)
    }
  }

  function selectShow(show: ShowItem) {
    setSelectedShowKey(show.show_key)
    setEditShow({
      displayName: show.display_name,
      altNamesText: toAltNamesText(show.alt_names),
      isActive: !!show.is_active,
    })
    setSaveResult("")
  }

  async function createShow() {
    if (!cleanToken) {
      setCreateResult("Enter your admin token first.")
      return
    }

    if (!addShow.displayName.trim()) {
      setCreateResult("Display name is required.")
      return
    }

    setCreateBusy(true)
    setCreateResult("")
    setSaveResult("")

    try {
      const res = await fetch("/api/admin/shows", {
        method: "POST",
        headers: {
          ...buildAdminHeaders(cleanToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: addShow.displayName.trim(),
          showKey: addShow.showKey.trim() || null,
          altNames: parseAltNamesText(addShow.altNamesText),
          isActive: addShow.isActive,
        }),
      })

      const json = (await res.json()) as { error?: string; show?: ShowItem }

      if (!res.ok) {
        setCreateResult(json.error || "Could not create show.")
        return
      }

      const createdShow = json.show
      setCreateResult("Show created.")
      setAddShow({
        displayName: "",
        showKey: "",
        altNamesText: "",
        isActive: true,
      })

      await loadShows(createdShow?.show_key)
    } catch (error: any) {
      setCreateResult(error?.message || "Could not create show.")
    } finally {
      setCreateBusy(false)
    }
  }

  async function saveShow() {
    if (!cleanToken) {
      setSaveResult("Enter your admin token first.")
      return
    }

    if (!selectedShowKey) {
      setSaveResult("Select a show first.")
      return
    }

    if (!editShow.displayName.trim()) {
      setSaveResult("Display name is required.")
      return
    }

    setSaveBusy(true)
    setSaveResult("")
    setCreateResult("")

    try {
      const res = await fetch(`/api/admin/shows/${encodeURIComponent(selectedShowKey)}`, {
        method: "PATCH",
        headers: {
          ...buildAdminHeaders(cleanToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: editShow.displayName.trim(),
          altNames: parseAltNamesText(editShow.altNamesText),
          isActive: editShow.isActive,
        }),
      })

      const json = (await res.json()) as { error?: string }

      if (!res.ok) {
        setSaveResult(json.error || "Could not save show.")
        return
      }

      setSaveResult("Saved.")
      await loadShows(selectedShowKey)
    } catch (error: any) {
      setSaveResult(error?.message || "Could not save show.")
    } finally {
      setSaveBusy(false)
    }
  }

  function clearToken() {
    setToken("")
    setShows([])
    setSelectedShowKey("")
    setListError("")
    setSaveResult("")
    setCreateResult("")
    try {
      sessionStorage.removeItem("mtq_admin_token")
    } catch {
      // ignore
    }
  }

  const filteredShows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return shows

    return shows.filter((show) => {
      const altNames = toAltNamesArray(show.alt_names).join(" ").toLowerCase()
      return (
        show.display_name.toLowerCase().includes(needle) ||
        show.show_key.toLowerCase().includes(needle) ||
        altNames.includes(needle)
      )
    })
  }, [shows, search])

  const selectedShow = useMemo(
    () => shows.find((show) => show.show_key === selectedShowKey) || null,
    [shows, selectedShowKey]
  )

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_minmax(360px,1fr)] xl:items-start">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Token and controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste ADMIN_TOKEN here"
                autoComplete="off"
                spellCheck={false}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
              />
              <Button variant="secondary" onClick={clearToken}>
                Clear token
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search shows"
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
              />
              <Button onClick={() => loadShows()}>Load shows</Button>
            </div>

            <div className="text-sm text-muted-foreground">
              Shows in this list feed the primary_show_key dropdown and the suggestion matcher.
            </div>

            {listError ? (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {listError}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {listBusy ? (
              <div className="text-sm text-muted-foreground">Loading shows…</div>
            ) : filteredShows.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No shows loaded yet. Enter your token, then click Load shows.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredShows.map((show) => {
                  const isSelected = show.show_key === selectedShowKey
                  const altNames = toAltNamesArray(show.alt_names)

                  return (
                    <button
                      key={show.show_key}
                      type="button"
                      onClick={() => selectShow(show)}
                      className={`block w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                        isSelected
                          ? "border-foreground bg-muted"
                          : "border-border bg-card hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="font-medium">{show.display_name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{show.show_key}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {show.is_active ? "Active" : "Inactive"}
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-muted-foreground">
                        Alt names: {altNames.length ? altNames.join(", ") : "None"}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Add show</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Display name</span>
              <input
                value={addShow.displayName}
                onChange={(event) =>
                  setAddShow((current) => ({ ...current, displayName: event.target.value }))
                }
                placeholder="The Curious Case of Benjamin Button"
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
              />
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium">Show key</span>
              <input
                value={addShow.showKey}
                onChange={(event) =>
                  setAddShow((current) => ({ ...current, showKey: event.target.value }))
                }
                placeholder={normaliseShowKey(addShow.displayName || "show_name")}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
              />
              <div className="text-xs text-muted-foreground">
                Leave blank to generate it automatically from the display name.
              </div>
            </label>

            <label className="grid gap-1">
              <span className="text-sm font-medium">Alternative names</span>
              <textarea
                value={addShow.altNamesText}
                onChange={(event) =>
                  setAddShow((current) => ({ ...current, altNamesText: event.target.value }))
                }
                rows={4}
                placeholder={"Benjamin Button\nCurious Case of Benjamin Button"}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-border"
              />
              <div className="text-xs text-muted-foreground">Enter one alternative name per line.</div>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={addShow.isActive}
                onChange={(event) =>
                  setAddShow((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              Active
            </label>

            <Button onClick={createShow} disabled={createBusy}>
              {createBusy ? "Creating…" : "Create show"}
            </Button>

            {createResult ? (
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  createResult === "Show created."
                    ? "border border-green-300 bg-green-50 text-green-700"
                    : "border border-red-300 bg-red-50 text-red-700"
                }`}
              >
                {createResult}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Edit selected show</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!selectedShow ? (
              <div className="text-sm text-muted-foreground">
                Select a show from the list to edit it.
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Show key
                  </div>
                  <div className="mt-1 text-sm">{selectedShow.show_key}</div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    This stays fixed in v1 so question links remain stable.
                  </div>
                </div>

                <label className="grid gap-1">
                  <span className="text-sm font-medium">Display name</span>
                  <input
                    value={editShow.displayName}
                    onChange={(event) =>
                      setEditShow((current) => ({ ...current, displayName: event.target.value }))
                    }
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-medium">Alternative names</span>
                  <textarea
                    value={editShow.altNamesText}
                    onChange={(event) =>
                      setEditShow((current) => ({ ...current, altNamesText: event.target.value }))
                    }
                    rows={5}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-border"
                  />
                  <div className="text-xs text-muted-foreground">Enter one alternative name per line.</div>
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editShow.isActive}
                    onChange={(event) =>
                      setEditShow((current) => ({ ...current, isActive: event.target.checked }))
                    }
                  />
                  Active
                </label>

                <Button onClick={saveShow} disabled={saveBusy}>
                  {saveBusy ? "Saving…" : "Save changes"}
                </Button>

                {saveResult ? (
                  <div
                    className={`rounded-lg px-3 py-2 text-sm ${
                      saveResult === "Saved."
                        ? "border border-green-300 bg-green-50 text-green-700"
                        : "border border-red-300 bg-red-50 text-red-700"
                    }`}
                  >
                    {saveResult}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}