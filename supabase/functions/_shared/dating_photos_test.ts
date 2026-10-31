import { assertEquals } from "@std/assert";
import { type DatingPhotoStore, purgeDatingPhotos } from "./dating_photos.ts";

function fakeStore(files: string[], exists = true) {
  const state = { exists, files: new Set(files), deleted: false, removeCalls: 0 };
  const store: DatingPhotoStore = {
    bucketExists: () => Promise.resolve(state.exists),
    listRoot: () => {
      const folders = new Set<string>();
      const root: string[] = [];
      for (const f of state.files) f.includes("/") ? folders.add(f.split("/")[0]) : root.push(f);
      return Promise.resolve({ folders: [...folders].sort(), files: root });
    },
    listFolder: (folder) => Promise.resolve([...state.files].filter((f) => f.startsWith(`${folder}/`))),
    remove: (paths) => {
      state.removeCalls++;
      for (const p of paths) state.files.delete(p);
      return Promise.resolve(paths.length);
    },
    deleteBucket: () => {
      if (state.files.size > 0) return Promise.reject(new Error("bucket non vide"));
      state.exists = false;
      state.deleted = true;
      return Promise.resolve();
    },
  };
  return { store, state };
}

Deno.test("purge-dating-photos : vide le bucket puis le supprime", async () => {
  const { store, state } = fakeStore(["u1/seed-1.jpg", "u1/seed-2.jpg", "u2/a.jpg", "racine.jpg"]);
  assertEquals(await purgeDatingPhotos(store), { removed: 4, bucket_deleted: true });
  assertEquals(state.files.size, 0);
  assertEquals(state.deleted, true);
});

Deno.test("purge-dating-photos : s'arrête au budget et reprend au passage suivant", async () => {
  const { store, state } = fakeStore(["u1/a.jpg", "u1/b.jpg", "u2/a.jpg", "u3/a.jpg"]);
  assertEquals(await purgeDatingPhotos(store, 2), { removed: 2, bucket_deleted: false });
  assertEquals(state.deleted, false);
  assertEquals(await purgeDatingPhotos(store, 2), { removed: 2, bucket_deleted: true });
  assertEquals(state.deleted, true);
});

Deno.test("purge-dating-photos : bucket déjà supprimé, rien à faire", async () => {
  const { store, state } = fakeStore([], false);
  assertEquals(await purgeDatingPhotos(store), { removed: 0, bucket_deleted: true });
  assertEquals(state.removeCalls, 0);
});

Deno.test("purge-dating-photos : bucket vide supprimé tout de suite", async () => {
  const { store, state } = fakeStore([]);
  assertEquals(await purgeDatingPhotos(store), { removed: 0, bucket_deleted: true });
  assertEquals(state.deleted, true);
});
