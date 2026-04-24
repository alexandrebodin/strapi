export interface FeaturesConfig {
  future?: {
    unstableMediaLibrary?: boolean;
    /**
     * When enabled, every content type that has not opted out via
     * `options.body.enabled = false` gets a pre-injected `body` attribute of
     * type `blocks`. Ships the backend + editor scaffolding; see Phase 2 of
     * the blocks-embeds-and-body plan.
     */
    body?: boolean;
  };
}

export interface FeaturesService {
  /**
   * This is the features.(js|ts) file in the user project.
   */
  config: FeaturesConfig | undefined;
  future: {
    isEnabled: (futureFlagName: string) => boolean;
  };
}
