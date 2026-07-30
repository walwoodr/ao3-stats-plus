import { useState, type FormEvent } from "react";

export interface TokenEntryFormProps {
  onSubmit: (token: string) => void;
  error?: string;
}

// Manual token-entry form shown in DashboardPage's empty/error states -
// e.g. a different browser/device than the one that ran the bookmarklet,
// or a stored token that no longer matches. A real accessible form
// (labeled input + submit), not a bare input.
export function TokenEntryForm({ onSubmit, error }: TokenEntryFormProps) {
  const [token, setToken] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = token.trim();

    if (!trimmed) {
      setValidationError("Please enter a token.");
      return;
    }

    setValidationError(null);
    onSubmit(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
      <label htmlFor="read-token-input" className="text-sm font-medium text-ink">
        Read token
      </label>
      <input
        id="read-token-input"
        type="text"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        className="rounded-md border border-ink/20 bg-card px-3 py-2 text-base text-ink outline-none transition-colors duration-200 focus:border-accent focus:ring-[3px] focus:ring-accent/15"
      />

      {validationError && <p className="text-sm text-destructive">{validationError}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="self-start cursor-pointer rounded-md bg-ink px-4 py-2 text-sm font-semibold text-paper outline-none transition-colors duration-200 hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Use this token
      </button>
    </form>
  );
}
