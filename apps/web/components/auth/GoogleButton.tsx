"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3a7.4 7.4 0 0 1-11-3.9H1.08v3.09A12 12 0 0 0 12 24z"
      />
      <path fill="#FBBC05" d="M5.07 14.19a7.2 7.2 0 0 1 0-4.38V6.72H1.08a12 12 0 0 0 0 10.56z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.08 6.72l3.99 3.09A7.16 7.16 0 0 1 12 4.75z"
      />
    </svg>
  );
}

export function GoogleButton() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-disabled="true"
            aria-label="Sign in with Google - coming soon"
            className="w-full cursor-not-allowed gap-2 opacity-60"
            onClick={(e) => e.preventDefault()}
          >
            <GoogleIcon />
            Sign in with Google
          </Button>
        }
      />
      <TooltipContent>Coming soon</TooltipContent>
    </Tooltip>
  );
}
