# Heads Up CSV writing guide

Use this when you want to bulk import Heads Up items and themed pack assignments.

## One row equals one item

Each CSV row should describe one Heads Up item.

That row can assign the item to several packs by using a pipe-separated `pack_names` field.

If you import an existing item by `item_id`, the importer will replace that item’s pack membership with the pack names listed in that row.

## Required column order

Use this exact order:

`item_id, answer_text, item_type, person_roles, difficulty, primary_show_key, notes, is_active, pack_names`

## What each column means

### `item_id`

Optional.

Leave this blank when you want to create a new Heads Up item.

Supply the existing UUID when you want to update an item that already exists.

## `answer_text`

Required.

This is the playable answer the acting player is trying to get their team to guess.

Examples:

- `Wicked`
- `Defying Gravity`
- `Elphaba`
- `Stephen Sondheim`

## `item_type`

Required.

Use one of these values:

- `show`
- `song`
- `character`
- `person`
- `phrase`
- `other`

## `person_roles`

Only use this when `item_type` is `person`.

Use a pipe-separated list inside one CSV cell.

Examples:

- `"performer"`
- `"composer|lyricist"`

Allowed values are:

- `performer`
- `composer`
- `lyricist`
- `book_writer`
- `director`
- `choreographer`
- `other`

Leave this blank for any non-person item.

## `difficulty`

Optional.

Use one of these values:

- `easy`
- `medium`
- `hard`

If you leave it blank, the importer uses `medium`.

## `primary_show_key`

Optional.

Use an existing show key from the `shows` table when the item clearly belongs to one show.

Leave it blank for broad phrases or people where one show link would be misleading.

## `notes`

Optional.

Use this for curation notes only.

Examples:

- `Ambiguous outside a Sondheim pack`
- `Best used for adult groups`

## `is_active`

Optional.

Use `true` or `false`.

If you leave it blank, the importer uses `true`.

## `pack_names`

Optional but strongly recommended.

Use a pipe-separated list of Heads Up pack names inside one CSV cell.

Example:

`"Characters|Villains|Modern Musicals"`

The importer will create missing pack names automatically.

## Quoting and escaping

Wrap these fields in double quotes on every row:

- `answer_text`
- `person_roles`
- `notes`
- `pack_names`

If the content contains a double quote character, escape it by doubling it.

Example:
`He said "hello"` becomes `"He said ""hello"""`

## Validate before import

Use the admin import page to run a validate-only pass before the real import.

That will tell you how many items will be created or updated, and how many missing packs will be created.

## Example rows

```csv
item_id,answer_text,item_type,person_roles,difficulty,primary_show_key,notes,is_active,pack_names
,Elphaba,character,,easy,wicked,,true,"Characters|Villains|Modern Musicals"
,Stephen Sondheim,person,"composer|lyricist",medium,,"Broad creator clue",true,"People|Creators|Sondheim"
```
