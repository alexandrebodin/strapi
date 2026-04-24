import { cloneDeep } from 'lodash/fp';
import _ from 'lodash';
import { yup, contentTypes as contentTypesUtils } from '@strapi/utils';
import type { Schema } from '@strapi/types';
import { validateContentTypeDefinition } from './validator';

export type ContentTypeDefinition = {
  schema: Schema.ContentType;
  actions: Record<string, unknown>;
  lifecycles: Record<string, unknown>;
};

const {
  CREATED_AT_ATTRIBUTE,
  UPDATED_AT_ATTRIBUTE,
  PUBLISHED_AT_ATTRIBUTE,
  FIRST_PUBLISHED_AT_ATTRIBUTE,
  CREATED_BY_ATTRIBUTE,
  UPDATED_BY_ATTRIBUTE,
} = contentTypesUtils.constants;

const createContentType = (uid: string, definition: ContentTypeDefinition) => {
  try {
    validateContentTypeDefinition(definition);
  } catch (e) {
    if (e instanceof yup.ValidationError) {
      throw new Error(`Content Type Definition is invalid for ${uid}'.\n${e.errors}`);
    }

    throw e;
  }

  const { schema, actions, lifecycles } = cloneDeep(definition);

  // general info
  Object.assign(schema, {
    uid,
    modelType: 'contentType',
    kind: schema.kind || 'collectionType',
    __schema__: pickSchema(definition.schema),
    modelName: definition.schema.info.singularName,
    actions,
    lifecycles,
  });

  addTimestamps(schema);

  // Published at is added regardless of draft and publish being enabled
  // In case it is not enabled, value will be always published, and it will not contain a draft
  addDraftAndPublish(schema);

  addCreatorFields(schema);

  addFirstPublishedAt(schema);

  addBody(schema);

  return schema;
};

const addTimestamps = (schema: Schema.ContentType) => {
  // attributes
  Object.assign(schema.attributes, {
    [CREATED_AT_ATTRIBUTE]: {
      type: 'datetime',
    },
    // TODO: handle on edit set to new date
    [UPDATED_AT_ATTRIBUTE]: {
      type: 'datetime',
    },
  });
};

const addDraftAndPublish = (schema: Schema.ContentType) => {
  if (!_.has(schema, 'options.draftAndPublish')) {
    _.set(schema, 'options.draftAndPublish', false); // Disabled by default
  }

  schema.attributes[PUBLISHED_AT_ATTRIBUTE] = {
    type: 'datetime',
    configurable: false,
    writable: true,
    visible: true,
    default() {
      return new Date();
    },
  };
};

const addFirstPublishedAt = (schema: Schema.ContentType) => {
  const isEnabled = contentTypesUtils.hasFirstPublishedAtField(schema);

  // Note: As an expertimental feature, we are okay if this data is deleted if this feature is
  // switched off. Once "preserve_attributes" come into play, this will be updated.
  if (isEnabled) {
    strapi.log.warn(`Experimental feature enabled: firstPublishedAt on ${schema.collectionName}`);
    schema.attributes[FIRST_PUBLISHED_AT_ATTRIBUTE] = {
      type: 'datetime',
      configurable: false,
      writable: true,
      visible: false,
      private: !isEnabled,
    };
  }
};

/**
 * Injects a pre-existing `body` attribute of type `blocks` on every content
 * type when the `future.body` flag is enabled. Per-type opt-out is supported
 * via `options.body.enabled = false` in the content-type schema file. The
 * injected attribute is non-configurable so users can't remove it via the CTB,
 * but it doesn't participate in the reserved-name list unless the feature is on.
 */
const addBody = (schema: Schema.ContentType) => {
  // Read the flag directly from config (same pattern as `hasFirstPublishedAtField`)
  // — the `strapi.features` service may or may not be eagerly available during
  // the register phase when content types are instantiated.
  const strapiInstance = (globalThis as any).strapi;
  const flagEnabled = strapiInstance?.config?.get?.('features.future.body', false) === true;
  if (!flagEnabled) return;

  // Only inject on user-authored content types. `admin::*` (permissions, users,
  // roles, tokens, sessions) and `strapi::*` internals have no editorial
  // surface and must not grow a body column. Plugin-provided types (like
  // `plugin::users-permissions.user`) are also excluded unless the plugin
  // author explicitly opts in via `options.body.enabled = true`.
  const uid = schema.uid as string | undefined;
  const isAdminOrStrapiInternal =
    typeof uid === 'string' && (uid.startsWith('admin::') || uid.startsWith('strapi::'));
  const isPlugin = typeof uid === 'string' && uid.startsWith('plugin::');

  const bodyOptions = (
    schema.options as
      | {
          body?: {
            enabled?: boolean;
            allowComponents?: boolean;
            allowDynamicZones?: boolean;
            allowRelations?: boolean;
          };
        }
      | undefined
  )?.body;
  if (bodyOptions?.enabled === false) return;

  if (isAdminOrStrapiInternal) return;
  // Plugins opt in explicitly; default behaviour is skip.
  if (isPlugin && bodyOptions?.enabled !== true) return;

  // The sub-schema (`allowComponents`, `allowDynamicZones`, `allowRelations`) is
  // mirrored into pluginOptions so the admin slash menu and the runtime validators
  // can read it without re-parsing the content-type options.
  const pluginBodyOptions = {
    allowComponents: bodyOptions?.allowComponents ?? true,
    allowDynamicZones: bodyOptions?.allowDynamicZones ?? true,
    allowRelations: bodyOptions?.allowRelations ?? true,
  };

  strapiInstance?.log?.info?.(
    `[future.body] injecting 'body' blocks attribute into ${schema.info?.singularName ?? 'content-type'}`
  );

  schema.attributes.body = {
    type: 'blocks',
    configurable: false,
    writable: true,
    visible: true,
    required: false,
    pluginOptions: {
      i18n: { localized: true },
      body: pluginBodyOptions,
    },
  } as Schema.Attribute.Blocks;
};

const addCreatorFields = (schema: Schema.ContentType) => {
  const isPrivate = !_.get(schema, 'options.populateCreatorFields', false);

  schema.attributes[CREATED_BY_ATTRIBUTE] = {
    type: 'relation',
    relation: 'oneToOne',
    target: 'admin::user',
    configurable: false,
    writable: false,
    visible: false,
    useJoinTable: false,
    private: isPrivate,
  };

  schema.attributes[UPDATED_BY_ATTRIBUTE] = {
    type: 'relation',
    relation: 'oneToOne',
    target: 'admin::user',
    configurable: false,
    writable: false,
    visible: false,
    useJoinTable: false,
    private: isPrivate,
  };
};

const getGlobalId = (schema: Schema.ContentType, prefix?: string) => {
  const modelName = schema.info.singularName;
  const globalId = prefix ? `${prefix}-${modelName}` : modelName;

  return schema.globalId || _.upperFirst(_.camelCase(globalId));
};

const pickSchema = (model: Schema.ContentType) => {
  const schema = _.cloneDeep(
    _.pick(model, [
      'connection',
      'collectionName',
      'info',
      'options',
      'pluginOptions',
      'attributes',
      'kind',
    ])
  );

  schema.kind = model.kind || 'collectionType';
  return schema;
};

export { createContentType, getGlobalId };
