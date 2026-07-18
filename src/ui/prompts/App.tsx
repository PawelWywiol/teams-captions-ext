import { signal } from "@preact/signals";
import { useState } from "preact/hooks";
import {
  createPromptTemplate,
  deletePromptTemplate,
  updatePromptTemplate,
  watchPromptTemplates,
} from "../../shared/db/index.js";
import type { StoredPromptTemplate } from "../../shared/db/schema.js";
import { Button, EmptyState, Field } from "../shared/primitives.js";
import { useLiveQuery } from "../shared/useLiveQuery.js";

const selectedId = signal<string | null>(null);

function pickInitial(templates: StoredPromptTemplate[]): void {
  if (!templates.length) {
    selectedId.value = null;
    return;
  }
  if (!selectedId.value || !templates.find((t) => t.id === selectedId.value)) {
    selectedId.value = templates[0]?.id ?? null;
  }
}

async function onNew(): Promise<void> {
  const name = prompt("New prompt name");
  if (name == null || !name.trim()) return;
  try {
    const created = await createPromptTemplate({ name });
    selectedId.value = created.id;
  } catch (error) {
    alert(error instanceof Error ? error.message : "Create failed");
  }
}

function PromptList({ templates }: { templates: StoredPromptTemplate[] }): preact.JSX.Element {
  if (!templates.length) {
    return <EmptyState title="No prompts yet" description="Create one to reuse across sessions." />;
  }
  return (
    <ul
      class="stack"
      style={{ listStyle: "none", padding: 0, margin: 0, overflow: "auto" }}
      data-testid="prompt-list"
    >
      {templates.map((t) => {
        const selected = t.id === selectedId.value;
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => {
                selectedId.value = t.id;
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "var(--space-3)",
                background: selected ? "var(--color-bg-elev)" : "transparent",
                borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
              }}
            >
              <span style={{ fontWeight: 600 }}>{t.name}</span>
              {t.title ? (
                <div class="muted" style={{ fontSize: "var(--text-xs)" }}>
                  {t.title}
                </div>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function PromptEditor({ template }: { template: StoredPromptTemplate }): preact.JSX.Element {
  // Editor is remounted via `key={template.id}` on selection change, so initial
  // state stays in sync without an explicit reset effect.
  const [name, setName] = useState(template.name);
  const [title, setTitle] = useState(template.title);
  const [body, setBody] = useState(template.body);
  const [statusMsg, setStatusMsg] = useState("");

  async function save(): Promise<void> {
    try {
      await updatePromptTemplate(template.id, { name, title, body });
      setStatusMsg("Saved");
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function duplicate(): Promise<void> {
    const nextName = prompt("New prompt name", `${name} copy`);
    if (nextName == null || !nextName.trim()) return;
    try {
      const created = await createPromptTemplate({ name: nextName, title, body });
      selectedId.value = created.id;
    } catch (error) {
      alert(error instanceof Error ? error.message : "Duplicate failed");
    }
  }

  async function remove(): Promise<void> {
    if (!confirm(`Delete "${template.name}"? This cannot be undone.`)) return;
    await deletePromptTemplate(template.id);
    selectedId.value = null;
  }

  return (
    <section class="stack" style={{ minWidth: 0 }} data-testid="prompt-editor">
      <Field label="Name" htmlFor="prompt-name">
        <input
          id="prompt-name"
          data-testid="prompt-name"
          value={name}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </Field>
      <Field label="Default Title" htmlFor="prompt-title" hint="Prefilled as the session title.">
        <input
          id="prompt-title"
          data-testid="prompt-title"
          value={title}
          onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
        />
      </Field>
      <Field
        label="Instruction Body"
        htmlFor="prompt-body"
        hint="Appended to the default analysis instructions when this prompt is used."
      >
        <textarea
          id="prompt-body"
          data-testid="prompt-body"
          rows={12}
          value={body}
          onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)}
          style={{ resize: "vertical", minHeight: "200px" }}
        />
      </Field>
      <div class="row">
        <Button variant="primary" onClick={save} data-testid="prompt-save">
          Save
        </Button>
        <Button onClick={duplicate} data-testid="prompt-duplicate">
          Duplicate
        </Button>
        <Button variant="danger" onClick={remove} data-testid="prompt-delete">
          Delete
        </Button>
        {statusMsg ? (
          <span class="muted" role="status" data-testid="prompt-status">
            {statusMsg}
          </span>
        ) : null}
      </div>
    </section>
  );
}

export function App(): preact.JSX.Element {
  const templates = useLiveQuery(() => watchPromptTemplates(), []);
  if (templates) pickInitial(templates);
  const selected = templates?.find((t) => t.id === selectedId.value) ?? null;

  return (
    <div
      class="stack"
      style={{
        height: "100vh",
        margin: 0,
        padding: "var(--space-4)",
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        gap: "var(--space-4)",
      }}
    >
      <aside class="stack" style={{ minHeight: 0 }}>
        <div class="row" style={{ justifyContent: "space-between" }}>
          <h1 style={{ margin: 0, fontSize: "var(--text-lg)" }}>Prompts</h1>
          <Button variant="primary" onClick={() => void onNew()} data-testid="new-prompt-btn">
            New prompt
          </Button>
        </div>
        {templates ? <PromptList templates={templates} /> : <p class="muted">Loading…</p>}
      </aside>
      <main class="stack" style={{ minHeight: 0 }}>
        {selected ? (
          <PromptEditor key={selected.id} template={selected} />
        ) : (
          <EmptyState
            title="Select a prompt"
            description="Predefined prompts appear in the list on the left."
          />
        )}
      </main>
    </div>
  );
}
