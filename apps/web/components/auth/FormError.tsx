export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-red-600">
      {message}
    </p>
  );
}

export function FormBanner({ message, variant = "error" }: { message: string; variant?: "error" | "success" }) {
  return (
    <div
      role="alert"
      className={
        variant === "error"
          ? "mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          : "mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
      }
    >
      {message}
    </div>
  );
}
