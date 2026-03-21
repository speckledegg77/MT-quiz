"use client"

import { useEffect, useMemo, useState } from "react"
import type { Dispatch, SetStateAction } from "react"

import { Button } from "@/components/ui/Button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import {
  HEADS_UP_DIFFICULTY_VALUES,
  HEADS_UP_ITEM_TYPE_VALUES,
  HEADS_UP_PERSON_ROLE_VALUES,
  type HeadsUpDifficulty,
  type HeadsUpItemType,
  type HeadsUpPersonRole,
} from "@/lib/headsUp"

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return "Something went wrong."
}

type ShowOption = {
  show_key: string
  display_name: string
}

type PackSummary = {
  id: string
  name: string
  description: string
  is_active: boolean
  item_count: number
  created_at?: string
  updated_at?: string
}

type ItemPack = {
  id: string
  name: string
  is_active: boolean
}

type HeadsUpItem = {
  id: string
  answer_text: string
  item_type: HeadsUpItemType
  person_roles: HeadsUpPersonRole[] | null
  difficulty: HeadsUpDifficulty
  primary_show_key: string | null
  notes: string
  is_active: boolean
  created_at?: string
  updated_at?: string
  packs: ItemPack[]
}

type HeadsUpItemsResponse = {
  ok: true
  items: HeadsUpItem[]
}

type HeadsUpPacksResponse = {
  ok: true
  packs: PackSummary[]
}

type ShowsResponse = {
  ok: true
  shows: ShowOption[]
}

type ItemFormState = {
  answerText: string
  itemType: HeadsUpItemType
  personRoles: HeadsUpPersonRole[]
  difficulty: HeadsUpDifficulty
  primaryShowKey: string
  notes: string
  isActive: boolean
  packIds: string[]
}

type PackFormState = {
  name: string
  description: string
  isActive: boolean
}

type ItemFilters = {
  search: string
  itemType: string
  difficulty: string
  packId: string
  activeState: string
}

const EMPTY_ITEM_FORM: ItemFormState = {
  answerText: "",
  itemType: "show",
  personRoles: [],
  difficulty: "medium",
  primaryShowKey: "",
  notes: "",
  isActive: true,
  packIds: [],
}

const EMPTY_PACK_FORM: PackFormState = {
  name: "",
  description: "",
  isActive: true,
}

function buildAdminHeaders(token: string) {
  return {
    "x-admin-token": token.trim(),
  }
}

function formatDateTime(value: string | undefined) {
  if (!value) return ""

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

function toItemFormState(item: HeadsUpItem): ItemFormState {
  return {
    answerText: item.answer_text,
    itemType: item.item_type,
    personRoles: Array.isArray(item.person_roles) ? item.person_roles : [],
    difficulty: item.difficulty,
    primaryShowKey: item.primary_show_key ?? "",
    notes: item.notes ?? "",
    isActive: !!item.is_active,
    packIds: item.packs.map((pack) => pack.id),
  }
}

function toPackFormState(pack: PackSummary): PackFormState {
  return {
    name: pack.name,
    description: pack.description ?? "",
    isActive: !!pack.is_active,
  }
}

function roleLabel(value: string) {
  return value.replace(/_/g, " ")
}

function itemTypeLabel(value: string) {
  return value.replace(/_/g, " ")
}

export function HeadsUpDashboard() {
  const [view, setView] = useState<"items" | "packs">("items")
  const [token, setToken] = useState("")
  const cleanToken = token.trim()

  const [items, setItems] = useState<HeadsUpItem[]>([])
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [shows, setShows] = useState<ShowOption[]>([])

  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState("")

  const [itemFilters, setItemFilters] = useState<ItemFilters>({
    search: "",
    itemType: "",
    difficulty: "",
    packId: "",
    activeState: "active",
  })
  const [packSearch, setPackSearch] = useState("")

  const [selectedItemId, setSelectedItemId] = useState("")
  const [selectedPackId, setSelectedPackId] = useState("")

  const [createItem, setCreateItem] = useState<ItemFormState>(EMPTY_ITEM_FORM)
  const [editItem, setEditItem] = useState<ItemFormState>(EMPTY_ITEM_FORM)
  const [createPack, setCreatePack] = useState<PackFormState>(EMPTY_PACK_FORM)
  const [editPack, setEditPack] = useState<PackFormState>(EMPTY_PACK_FORM)

  const [createItemBusy, setCreateItemBusy] = useState(false)
  const [saveItemBusy, setSaveItemBusy] = useState(false)
  const [createPackBusy, setCreatePackBusy] = useState(false)
  const [savePackBusy, setSavePackBusy] = useState(false)

  const [createItemResult, setCreateItemResult] = useState("")
  const [saveItemResult, setSaveItemResult] = useState("")
  const [createPackResult, setCreatePackResult] = useState("")
  const [savePackResult, setSavePackResult] = useState("")

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("mtq_admin_token") ?? ""
      if (saved) setToken(saved)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const selectedItem = items.find((item) => item.id === selectedItemId)
    if (selectedItem) {
      setEditItem(toItemFormState(selectedItem))
    } else {
      setEditItem(EMPTY_ITEM_FORM)
    }
  }, [items, selectedItemId])

  useEffect(() => {
    const selectedPack = packs.find((pack) => pack.id === selectedPackId)
    if (selectedPack) {
      setEditPack(toPackFormState(selectedPack))
    } else {
      setEditPack(EMPTY_PACK_FORM)
    }
  }, [packs, selectedPackId])

  async function loadAll(nextSelectedItemId?: string, nextSelectedPackId?: string) {
    if (!cleanToken) {
      setLoadError("Enter your admin token first.")
      setItems([])
      setPacks([])
      setShows([])
      return
    }

    setBusy(true)
    setLoadError("")
    setCreateItemResult("")
    setSaveItemResult("")
    setCreatePackResult("")
    setSavePackResult("")

    try {
      try {
        sessionStorage.setItem("mtq_admin_token", cleanToken)
      } catch {
        // ignore
      }

      const [itemsRes, packsRes, showsRes] = await Promise.all([
        fetch("/api/admin/heads-up/items", {
          headers: buildAdminHeaders(cleanToken),
          cache: "no-store",
        }),
        fetch("/api/admin/heads-up/packs", {
          headers: buildAdminHeaders(cleanToken),
          cache: "no-store",
        }),
        fetch("/api/admin/shows", {
          headers: buildAdminHeaders(cleanToken),
          cache: "no-store",
        }),
      ])

      const itemsJson = (await itemsRes.json()) as HeadsUpItemsResponse | { error?: string }
      const packsJson = (await packsRes.json()) as HeadsUpPacksResponse | { error?: string }
      const showsJson = (await showsRes.json()) as ShowsResponse | { error?: string }

      if (!itemsRes.ok) {
        setLoadError((itemsJson as { error?: string }).error || "Could not load Heads Up items.")
        setItems([])
        return
      }

      if (!packsRes.ok) {
        setLoadError((packsJson as { error?: string }).error || "Could not load Heads Up packs.")
        setPacks([])
        return
      }

      if (!showsRes.ok) {
        setLoadError((showsJson as { error?: string }).error || "Could not load shows.")
        setShows([])
        return
      }

      const nextItems = (itemsJson as HeadsUpItemsResponse).items ?? []
      const nextPacks = (packsJson as HeadsUpPacksResponse).packs ?? []
      const nextShows = (showsJson as ShowsResponse).shows ?? []

      setItems(nextItems)
      setPacks(nextPacks)
      setShows(nextShows)

      const targetItemId =
        nextSelectedItemId || selectedItemId || (nextItems.length ? nextItems[0]?.id : "")
      const targetPackId =
        nextSelectedPackId || selectedPackId || (nextPacks.length ? nextPacks[0]?.id : "")

      if (targetItemId && nextItems.some((item) => item.id === targetItemId)) {
        setSelectedItemId(targetItemId)
      } else {
        setSelectedItemId("")
      }

      if (targetPackId && nextPacks.some((pack) => pack.id === targetPackId)) {
        setSelectedPackId(targetPackId)
      } else {
        setSelectedPackId("")
      }
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error) || "Could not load Heads Up data.")
      setItems([])
      setPacks([])
      setShows([])
    } finally {
      setBusy(false)
    }
  }

  const filteredItems = useMemo(() => {
    const searchNeedle = itemFilters.search.trim().toLowerCase()

    return items.filter((item) => {
      if (itemFilters.itemType && item.item_type !== itemFilters.itemType) return false
      if (itemFilters.difficulty && item.difficulty !== itemFilters.difficulty) return false
      if (itemFilters.packId && !item.packs.some((pack) => pack.id === itemFilters.packId)) return false
      if (itemFilters.activeState === "active" && !item.is_active) return false
      if (itemFilters.activeState === "inactive" && item.is_active) return false
      if (itemFilters.activeState === "unassigned" && item.packs.length > 0) return false

      if (!searchNeedle) return true

      const haystack = [
        item.answer_text,
        item.item_type,
        item.difficulty,
        item.primary_show_key ?? "",
        item.notes ?? "",
        item.packs.map((pack) => pack.name).join(" "),
        (item.person_roles ?? []).join(" "),
      ]
        .join(" ")
        .toLowerCase()

      return haystack.includes(searchNeedle)
    })
  }, [items, itemFilters])

  const filteredPacks = useMemo(() => {
    const needle = packSearch.trim().toLowerCase()
    if (!needle) return packs

    return packs.filter((pack) => {
      const haystack = `${pack.name} ${pack.description ?? ""}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [packs, packSearch])

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId]
  )

  const selectedPack = useMemo(
    () => packs.find((pack) => pack.id === selectedPackId) ?? null,
    [packs, selectedPackId]
  )

  const itemsInSelectedPack = useMemo(() => {
    if (!selectedPackId) return []
    return items
      .filter((item) => item.packs.some((pack) => pack.id === selectedPackId))
      .sort((a, b) => a.answer_text.localeCompare(b.answer_text))
  }, [items, selectedPackId])

  function clearToken() {
    setToken("")
    setItems([])
    setPacks([])
    setShows([])
    setSelectedItemId("")
    setSelectedPackId("")
    setLoadError("")
    setCreateItemResult("")
    setSaveItemResult("")
    setCreatePackResult("")
    setSavePackResult("")
    try {
      sessionStorage.removeItem("mtq_admin_token")
    } catch {
      // ignore
    }
  }

  function togglePackSelection(value: string, setForm: (updater: (prev: ItemFormState) => ItemFormState) => void) {
    setForm((prev) => {
      const exists = prev.packIds.includes(value)
      return {
        ...prev,
        packIds: exists ? prev.packIds.filter((item) => item !== value) : [...prev.packIds, value],
      }
    })
  }

  function togglePersonRole(
    value: HeadsUpPersonRole,
    setForm: (updater: (prev: ItemFormState) => ItemFormState) => void
  ) {
    setForm((prev) => {
      const exists = prev.personRoles.includes(value)
      return {
        ...prev,
        personRoles: exists
          ? prev.personRoles.filter((item) => item !== value)
          : [...prev.personRoles, value],
      }
    })
  }

  function updateItemType(
    nextItemType: HeadsUpItemType,
    setForm: (updater: (prev: ItemFormState) => ItemFormState) => void
  ) {
    setForm((prev) => ({
      ...prev,
      itemType: nextItemType,
      personRoles: nextItemType === "person" ? prev.personRoles : [],
    }))
  }

  async function createItemSubmit() {
    if (!cleanToken) {
      setCreateItemResult("Enter your admin token first.")
      return
    }

    if (!createItem.answerText.trim()) {
      setCreateItemResult("Answer text is required.")
      return
    }

    if (createItem.itemType === "person" && createItem.personRoles.length === 0) {
      setCreateItemResult("Choose at least one person role.")
      return
    }

    setCreateItemBusy(true)
    setCreateItemResult("")
    setSaveItemResult("")

    try {
      const res = await fetch("/api/admin/heads-up/items", {
        method: "POST",
        headers: {
          ...buildAdminHeaders(cleanToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answerText: createItem.answerText.trim(),
          itemType: createItem.itemType,
          personRoles: createItem.itemType === "person" ? createItem.personRoles : [],
          difficulty: createItem.difficulty,
          primaryShowKey: createItem.primaryShowKey.trim() || null,
          notes: createItem.notes,
          isActive: createItem.isActive,
          packIds: createItem.packIds,
        }),
      })

      const json = (await res.json()) as { error?: string; item?: HeadsUpItem }

      if (!res.ok) {
        setCreateItemResult(json.error || "Could not create Heads Up item.")
        return
      }

      setCreateItemResult("Heads Up item created.")
      setCreateItem(EMPTY_ITEM_FORM)
      await loadAll(json.item?.id, undefined)
    } catch (error: unknown) {
      setCreateItemResult(getErrorMessage(error) || "Could not create Heads Up item.")
    } finally {
      setCreateItemBusy(false)
    }
  }

  async function saveItemSubmit() {
    if (!cleanToken) {
      setSaveItemResult("Enter your admin token first.")
      return
    }

    if (!selectedItemId) {
      setSaveItemResult("Select an item first.")
      return
    }

    if (!editItem.answerText.trim()) {
      setSaveItemResult("Answer text is required.")
      return
    }

    if (editItem.itemType === "person" && editItem.personRoles.length === 0) {
      setSaveItemResult("Choose at least one person role.")
      return
    }

    setSaveItemBusy(true)
    setSaveItemResult("")
    setCreateItemResult("")

    try {
      const res = await fetch(`/api/admin/heads-up/items/${encodeURIComponent(selectedItemId)}`, {
        method: "PATCH",
        headers: {
          ...buildAdminHeaders(cleanToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answerText: editItem.answerText.trim(),
          itemType: editItem.itemType,
          personRoles: editItem.itemType === "person" ? editItem.personRoles : [],
          difficulty: editItem.difficulty,
          primaryShowKey: editItem.primaryShowKey.trim() || null,
          notes: editItem.notes,
          isActive: editItem.isActive,
          packIds: editItem.packIds,
        }),
      })

      const json = (await res.json()) as { error?: string; item?: HeadsUpItem }

      if (!res.ok) {
        setSaveItemResult(json.error || "Could not save Heads Up item.")
        return
      }

      setSaveItemResult("Saved.")
      await loadAll(json.item?.id ?? selectedItemId, undefined)
    } catch (error: unknown) {
      setSaveItemResult(getErrorMessage(error) || "Could not save Heads Up item.")
    } finally {
      setSaveItemBusy(false)
    }
  }

  async function createPackSubmit() {
    if (!cleanToken) {
      setCreatePackResult("Enter your admin token first.")
      return
    }

    if (!createPack.name.trim()) {
      setCreatePackResult("Pack name is required.")
      return
    }

    setCreatePackBusy(true)
    setCreatePackResult("")
    setSavePackResult("")

    try {
      const res = await fetch("/api/admin/heads-up/packs", {
        method: "POST",
        headers: {
          ...buildAdminHeaders(cleanToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: createPack.name.trim(),
          description: createPack.description,
          isActive: createPack.isActive,
        }),
      })

      const json = (await res.json()) as { error?: string; pack?: PackSummary }

      if (!res.ok) {
        setCreatePackResult(json.error || "Could not create pack.")
        return
      }

      setCreatePackResult("Pack created.")
      setCreatePack(EMPTY_PACK_FORM)
      await loadAll(undefined, json.pack?.id)
    } catch (error: unknown) {
      setCreatePackResult(getErrorMessage(error) || "Could not create pack.")
    } finally {
      setCreatePackBusy(false)
    }
  }

  async function savePackSubmit() {
    if (!cleanToken) {
      setSavePackResult("Enter your admin token first.")
      return
    }

    if (!selectedPackId) {
      setSavePackResult("Select a pack first.")
      return
    }

    if (!editPack.name.trim()) {
      setSavePackResult("Pack name is required.")
      return
    }

    setSavePackBusy(true)
    setSavePackResult("")
    setCreatePackResult("")

    try {
      const res = await fetch(`/api/admin/heads-up/packs/${encodeURIComponent(selectedPackId)}`, {
        method: "PATCH",
        headers: {
          ...buildAdminHeaders(cleanToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editPack.name.trim(),
          description: editPack.description,
          isActive: editPack.isActive,
        }),
      })

      const json = (await res.json()) as { error?: string; pack?: PackSummary }

      if (!res.ok) {
        setSavePackResult(json.error || "Could not save pack.")
        return
      }

      setSavePackResult("Saved.")
      await loadAll(undefined, json.pack?.id ?? selectedPackId)
    } catch (error: unknown) {
      setSavePackResult(getErrorMessage(error) || "Could not save pack.")
    } finally {
      setSavePackBusy(false)
    }
  }

  return (
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

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => loadAll()} disabled={busy}>
              {busy ? "Loading…" : "Load Heads Up data"}
            </Button>
            <Button
              variant={view === "items" ? "primary" : "secondary"}
              onClick={() => setView("items")}
            >
              Items
            </Button>
            <Button
              variant={view === "packs" ? "primary" : "secondary"}
              onClick={() => setView("packs")}
            >
              Packs
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            Heads Up items are stored separately from normal questions. Packs are themed decks, and one
            item can belong to several packs.
          </div>

          {loadError ? (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {view === "items" ? (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_minmax(360px,0.95fr)] xl:items-start">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create item</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ItemForm
                  form={createItem}
                  setForm={setCreateItem}
                  shows={shows}
                  packs={packs}
                  onPackToggle={(value) => togglePackSelection(value, setCreateItem)}
                  onRoleToggle={(value) => togglePersonRole(value, setCreateItem)}
                  onItemTypeChange={(value) => updateItemType(value, setCreateItem)}
                  submitLabel={createItemBusy ? "Creating…" : "Create item"}
                  onSubmit={createItemSubmit}
                  busy={createItemBusy}
                />

                {createItemResult ? (
                  <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                    {createItemResult}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Item filters</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <input
                  value={itemFilters.search}
                  onChange={(event) =>
                    setItemFilters((prev) => ({
                      ...prev,
                      search: event.target.value,
                    }))
                  }
                  placeholder="Search items, packs, notes"
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border xl:col-span-2"
                />

                <select
                  value={itemFilters.itemType}
                  onChange={(event) =>
                    setItemFilters((prev) => ({
                      ...prev,
                      itemType: event.target.value,
                    }))
                  }
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
                >
                  <option value="">Any type</option>
                  {HEADS_UP_ITEM_TYPE_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {itemTypeLabel(value)}
                    </option>
                  ))}
                </select>

                <select
                  value={itemFilters.difficulty}
                  onChange={(event) =>
                    setItemFilters((prev) => ({
                      ...prev,
                      difficulty: event.target.value,
                    }))
                  }
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
                >
                  <option value="">Any difficulty</option>
                  {HEADS_UP_DIFFICULTY_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>

                <select
                  value={itemFilters.packId}
                  onChange={(event) =>
                    setItemFilters((prev) => ({
                      ...prev,
                      packId: event.target.value,
                    }))
                  }
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
                >
                  <option value="">Any pack</option>
                  {packs.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name}
                    </option>
                  ))}
                </select>

                <select
                  value={itemFilters.activeState}
                  onChange={(event) =>
                    setItemFilters((prev) => ({
                      ...prev,
                      activeState: event.target.value,
                    }))
                  }
                  className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
                >
                  <option value="all">Any status</option>
                  <option value="active">Active only</option>
                  <option value="inactive">Inactive only</option>
                  <option value="unassigned">Unassigned only</option>
                </select>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Items</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {filteredItems.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No Heads Up items match these filters.</div>
                ) : (
                  filteredItems.map((item) => {
                    const selected = item.id === selectedItemId
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedItemId(item.id)}
                        className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                          selected ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">{item.answer_text}</div>
                            <div className="text-xs text-muted-foreground">
                              {itemTypeLabel(item.item_type)} • {item.difficulty}
                              {item.primary_show_key ? ` • ${item.primary_show_key}` : ""}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {item.is_active ? "Active" : "Inactive"}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1">
                          {item.packs.length === 0 ? (
                            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                              No pack
                            </span>
                          ) : (
                            item.packs.map((pack) => (
                              <span
                                key={pack.id}
                                className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                              >
                                {pack.name}
                              </span>
                            ))
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>

          <div className="xl:sticky xl:top-4">
            <Card>
              <CardHeader>
                <CardTitle>Selected item</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedItem ? (
                  <div className="text-sm text-muted-foreground">
                    Load your data, then choose an item to edit its packs, roles, show link, and active status.
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                      <div className="font-medium">{selectedItem.answer_text}</div>
                      <div className="text-xs text-muted-foreground">
                        Created {formatDateTime(selectedItem.created_at)}
                        {selectedItem.updated_at ? ` • Updated ${formatDateTime(selectedItem.updated_at)}` : ""}
                      </div>
                    </div>

                    <ItemForm
                      form={editItem}
                      setForm={setEditItem}
                      shows={shows}
                      packs={packs}
                      onPackToggle={(value) => togglePackSelection(value, setEditItem)}
                      onRoleToggle={(value) => togglePersonRole(value, setEditItem)}
                      onItemTypeChange={(value) => updateItemType(value, setEditItem)}
                      submitLabel={saveItemBusy ? "Saving…" : "Save item"}
                      onSubmit={saveItemSubmit}
                      busy={saveItemBusy}
                    />

                    {saveItemResult ? (
                      <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                        {saveItemResult}
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.05fr_minmax(360px,0.95fr)] xl:items-start">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create pack</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <PackForm
                  form={createPack}
                  setForm={setCreatePack}
                  submitLabel={createPackBusy ? "Creating…" : "Create pack"}
                  onSubmit={createPackSubmit}
                  busy={createPackBusy}
                />

                {createPackResult ? (
                  <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                    {createPackResult}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Packs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  value={packSearch}
                  onChange={(event) => setPackSearch(event.target.value)}
                  placeholder="Search packs"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
                />

                {filteredPacks.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No packs match this search.</div>
                ) : (
                  filteredPacks.map((pack) => {
                    const selected = pack.id === selectedPackId
                    return (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => setSelectedPackId(pack.id)}
                        className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                          selected ? "border-foreground bg-muted" : "border-border bg-background hover:bg-muted"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">{pack.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {pack.item_count} {pack.item_count === 1 ? "item" : "items"}
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {pack.is_active ? "Active" : "Inactive"}
                          </div>
                        </div>
                        {pack.description ? (
                          <div className="mt-2 text-xs text-muted-foreground">{pack.description}</div>
                        ) : null}
                      </button>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 xl:sticky xl:top-4">
            <Card>
              <CardHeader>
                <CardTitle>Selected pack</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedPack ? (
                  <div className="text-sm text-muted-foreground">
                    Choose a pack to edit its details and see which items are currently assigned to it.
                  </div>
                ) : (
                  <>
                    <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                      <div className="font-medium">{selectedPack.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {selectedPack.item_count} {selectedPack.item_count === 1 ? "item" : "items"}
                        {selectedPack.updated_at ? ` • Updated ${formatDateTime(selectedPack.updated_at)}` : ""}
                      </div>
                    </div>

                    <PackForm
                      form={editPack}
                      setForm={setEditPack}
                      submitLabel={savePackBusy ? "Saving…" : "Save pack"}
                      onSubmit={savePackSubmit}
                      busy={savePackBusy}
                    />

                    {savePackResult ? (
                      <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                        {savePackResult}
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assigned items</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {!selectedPack ? (
                  <div className="text-sm text-muted-foreground">Choose a pack to see its items.</div>
                ) : itemsInSelectedPack.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    This pack does not have any items yet. Add them from the Items tab.
                  </div>
                ) : (
                  itemsInSelectedPack.map((item) => (
                    <div key={item.id} className="rounded-lg border border-border bg-background px-3 py-2">
                      <div className="text-sm font-medium">{item.answer_text}</div>
                      <div className="text-xs text-muted-foreground">
                        {itemTypeLabel(item.item_type)} • {item.difficulty}
                        {item.primary_show_key ? ` • ${item.primary_show_key}` : ""}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

type ItemFormProps = {
  form: ItemFormState
  setForm: Dispatch<SetStateAction<ItemFormState>>
  shows: ShowOption[]
  packs: PackSummary[]
  onPackToggle: (value: string) => void
  onRoleToggle: (value: HeadsUpPersonRole) => void
  onItemTypeChange: (value: HeadsUpItemType) => void
  submitLabel: string
  onSubmit: () => void
  busy: boolean
}

function ItemForm({
  form,
  setForm,
  shows,
  packs,
  onPackToggle,
  onRoleToggle,
  onItemTypeChange,
  submitLabel,
  onSubmit,
  busy,
}: ItemFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <div className="text-muted-foreground">Answer text</div>
          <input
            value={form.answerText}
            onChange={(event) => setForm((prev) => ({ ...prev, answerText: event.target.value }))}
            placeholder="For example: Patti LuPone"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
          />
        </label>

        <label className="space-y-1 text-sm">
          <div className="text-muted-foreground">Type</div>
          <select
            value={form.itemType}
            onChange={(event) => onItemTypeChange(event.target.value as HeadsUpItemType)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
          >
            {HEADS_UP_ITEM_TYPE_VALUES.map((value) => (
              <option key={value} value={value}>
                {itemTypeLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <div className="text-muted-foreground">Difficulty</div>
          <select
            value={form.difficulty}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                difficulty: event.target.value as HeadsUpDifficulty,
              }))
            }
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
          >
            {HEADS_UP_DIFFICULTY_VALUES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <div className="text-muted-foreground">Primary show</div>
          <select
            value={form.primaryShowKey}
            onChange={(event) => setForm((prev) => ({ ...prev, primaryShowKey: event.target.value }))}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
          >
            <option value="">No linked show</option>
            {shows.map((show) => (
              <option key={show.show_key} value={show.show_key}>
                {show.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {form.itemType === "person" ? (
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Person roles</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {HEADS_UP_PERSON_ROLE_VALUES.map((value) => {
              const checked = form.personRoles.includes(value)
              return (
                <label
                  key={value}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onRoleToggle(value)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span>{roleLabel(value)}</span>
                </label>
              )
            })}
          </div>
        </div>
      ) : null}

      <label className="space-y-1 text-sm">
        <div className="text-muted-foreground">Notes</div>
        <textarea
          value={form.notes}
          onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
          rows={4}
          placeholder="Optional curation notes"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-border"
        />
      </label>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">Packs</div>
        <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {packs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              Create a pack first.
            </div>
          ) : (
            packs.map((pack) => {
              const checked = form.packIds.includes(pack.id)
              return (
                <label
                  key={pack.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onPackToggle(pack.id)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <span className="min-w-0 flex-1 truncate">{pack.name}</span>
                </label>
              )
            })
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
          className="h-4 w-4 rounded border-border"
        />
        <span>Active</span>
      </label>

      <Button onClick={onSubmit} disabled={busy}>
        {submitLabel}
      </Button>
    </div>
  )
}

type PackFormProps = {
  form: PackFormState
  setForm: Dispatch<SetStateAction<PackFormState>>
  submitLabel: string
  onSubmit: () => void
  busy: boolean
}

function PackForm({ form, setForm, submitLabel, onSubmit, busy }: PackFormProps) {
  return (
    <div className="space-y-4">
      <label className="space-y-1 text-sm">
        <div className="text-muted-foreground">Pack name</div>
        <input
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          placeholder="For example: Villains"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-border"
        />
      </label>

      <label className="space-y-1 text-sm">
        <div className="text-muted-foreground">Description</div>
        <textarea
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          rows={3}
          placeholder="Optional pack description"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-border"
        />
      </label>

      <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
          className="h-4 w-4 rounded border-border"
        />
        <span>Active</span>
      </label>

      <Button onClick={onSubmit} disabled={busy}>
        {submitLabel}
      </Button>
    </div>
  )
}
