import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Public routes - jinhe bina login ke access kiya ja sakta hai
const isPublicRoute = createRouteMatcher([
  '/',
  '/auth(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/find-my-photos(.*)',
  '/portal(.*)',
  '/api(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  // Agar route public nahi hai toh authentication required
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};