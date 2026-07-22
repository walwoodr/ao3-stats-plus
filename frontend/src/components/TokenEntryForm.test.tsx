import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TokenEntryForm } from "./TokenEntryForm";

// The manual token-entry form is a real accessible form (labeled input +
// submit) shown in DashboardPage's EmptyState when there's no token in the
// URL and none stored - e.g. a different browser/device.
describe("TokenEntryForm", () => {
  it("renders a labeled text input for the token", () => {
    render(<TokenEntryForm onSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/read token/i)).toBeInTheDocument();
  });

  it("renders a submit button", () => {
    render(<TokenEntryForm onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: /use this token|submit/i })).toBeInTheDocument();
  });

  it("calls onSubmit with the entered token on a valid submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TokenEntryForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/read token/i), "tok_typed_in");
    await user.click(screen.getByRole("button", { name: /use this token|submit/i }));

    expect(onSubmit).toHaveBeenCalledWith("tok_typed_in");
  });

  it("submits via the keyboard (Enter) without requiring a mouse click", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TokenEntryForm onSubmit={onSubmit} />);

    const input = screen.getByLabelText(/read token/i);
    await user.click(input);
    await user.keyboard("tok_via_keyboard{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("tok_via_keyboard");
  });

  it("shows a validation message and does not submit when the field is left empty", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TokenEntryForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: /use this token|submit/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/enter.*token|required/i)).toBeInTheDocument();
  });

  it("displays an externally supplied error (e.g. token mismatch) accessibly", () => {
    render(<TokenEntryForm onSubmit={vi.fn()} error="That token doesn't match this username." />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/doesn't match/i);
  });

  it("keeps a sane tab order: input before submit button", () => {
    render(<TokenEntryForm onSubmit={vi.fn()} />);

    const input = screen.getByLabelText(/read token/i);
    const button = screen.getByRole("button", { name: /use this token|submit/i });
    expect(input.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
