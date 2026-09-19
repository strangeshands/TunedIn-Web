export type MusicState =
    | "Reduced"
    | "Baseline"
    | "Elevated";

export type MusicTrack = {
    id: string;
    state: MusicState;
    fileName: string;
    url: string;
};

export type MusicManifest = {
    Reduced: MusicTrack[];
    Baseline: MusicTrack[];
    Elevated: MusicTrack[];
};

const API_URL = "http://127.0.0.1:3001";

async function request<T>(
    path: string,
): Promise<T> {
    const response = await fetch(
        `${API_URL}${path}`,
    );

    if (!response.ok) {
        const message =
            await response.text();

        throw new Error(
            message ||
                `Request failed with status ${response.status}`,
        );
    }

    return response.json() as Promise<T>;
}

/**
 * Loads the music-bank manifest from the
 * Node/Express backend.
 *
 * Expected backend route:
 *
 * GET /api/music
 */
export function getMusicManifest() {
    return request<MusicManifest>(
        "/api/music",
    );
}

/**
 * Converts a backend-relative music path
 *
 * /music/Baseline/example.wav
 *
 * into:
 *
 * http://127.0.0.1:3001/music/Baseline/example.wav
 */
export function getMusicUrl(
    track: MusicTrack,
) {
    if (
        track.url.startsWith("http://") ||
        track.url.startsWith("https://")
    ) {
        return track.url;
    }

    return `${API_URL}${track.url}`;
}