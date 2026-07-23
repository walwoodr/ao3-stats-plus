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
      <label htmlFor="read-token-input" className="text-sm font-medium text-slate-700">
        Read token
      </label>
      <input
        id="read-token-input"
        type="text"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        className="rounded-md border border-slate-300 px-3 py-2"
      />

      {validationError && <p className="text-sm text-red-600">{validationError}</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Use this token
      </button>
    </form>
  );
}
