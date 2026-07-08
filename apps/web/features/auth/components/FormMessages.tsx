export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs text-red-600">
      {message}
    </p>
  );
}

export function FormBanner({
  message,
  variant = "error",
}: {
  message: React.ReactNode;
  variant?: "error" | "success";
}) {
  return (
    <div
      role="alert"
      className={
        variant === "error"
          ? "text-body mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700"
          : "text-body mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-700"
      }
    >
      {message}
    </div>
  );
}
