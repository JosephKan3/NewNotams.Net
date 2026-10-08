import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

const config = {
  default: {},
  // This app has no `revalidateTag`/`revalidatePath`/`export const revalidate`
  // calls anywhere (confirmed by grep across app/ and lib/) and the one
  // static page (`/`) is a plain SSG build-time render, never re-triggered.
  // The tag cache exists solely to support revalidateTag/revalidatePath on
  // the App Router -- disabling it here removes an otherwise-unused
  // DynamoDB table, its one-time init Lambda, and the custom resource that
  // seeds it from the deployed infrastructure. Safe specifically because
  // nothing in this app calls either function; the OpenNext docs call this
  // setting dangerous in general (it breaks those two functions on the App
  // Router) precisely because most App Router apps do use them.
  dangerous: {
    disableTagCache: true,
  },
} satisfies OpenNextConfig;

export default config;
