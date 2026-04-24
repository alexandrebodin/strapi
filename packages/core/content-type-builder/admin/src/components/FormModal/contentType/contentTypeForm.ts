import { getTrad } from '../../../utils/getTrad';

const nameField = {
  name: 'displayName',
  type: 'text',
  intlLabel: {
    id: getTrad('contentType.displayName.label'),
    defaultMessage: 'Display name',
  },
};

export const contentTypeForm = {
  advanced: {
    default() {
      return {
        sections: [
          {
            items: [
              {
                intlLabel: {
                  id: getTrad('contentType.draftAndPublish.label'),
                  defaultMessage: 'Draft & publish',
                },
                description: {
                  id: getTrad('contentType.draftAndPublish.description'),
                  defaultMessage:
                    'Allows writing a draft version of an entry, before it is published',
                },
                name: 'draftAndPublish',
                type: 'toggle-draft-publish',
                validations: {},
              },
            ],
          },
          {
            sectionTitle: {
              id: getTrad('contentType.body.section.title'),
              defaultMessage: 'Body (experimental)',
            },
            items: [
              {
                intlLabel: {
                  id: getTrad('contentType.body.enabled.label'),
                  defaultMessage: 'Enable body field',
                },
                description: {
                  id: getTrad('contentType.body.enabled.description'),
                  defaultMessage:
                    'Injects a pre-existing "body" blocks field on this content type. Requires the `future.body` feature flag.',
                },
                name: 'bodyEnabled',
                type: 'body-toggle',
                validations: {},
              },
              {
                intlLabel: {
                  id: getTrad('contentType.body.allowComponents.label'),
                  defaultMessage: 'Allow components in body',
                },
                name: 'bodyAllowComponents',
                type: 'body-toggle',
                validations: {},
              },
              {
                intlLabel: {
                  id: getTrad('contentType.body.allowDynamicZones.label'),
                  defaultMessage: 'Allow dynamic zones in body',
                },
                name: 'bodyAllowDynamicZones',
                type: 'body-toggle',
                validations: {},
              },
              {
                intlLabel: {
                  id: getTrad('contentType.body.allowRelations.label'),
                  defaultMessage: 'Allow relations in body',
                },
                name: 'bodyAllowRelations',
                type: 'body-toggle',
                validations: {},
              },
            ],
          },
        ],
      };
    },
  },
  base: {
    create() {
      return {
        sections: [
          {
            sectionTitle: null,
            items: [
              nameField,
              {
                description: {
                  id: getTrad('contentType.apiId-singular.description'),
                  defaultMessage:
                    'Used to generate the API routes and databases tables/collections',
                },
                intlLabel: {
                  id: getTrad('contentType.apiId-singular.label'),
                  defaultMessage: 'API ID (Singular)',
                },
                name: 'singularName',
                type: 'text-singular',
              },
              {
                type: 'pushRight',
                size: 6,
                intlLabel: { id: '', defaultMessage: '' },
                name: 'pushRight',
              },
              {
                description: {
                  id: getTrad('contentType.apiId-plural.description'),
                  defaultMessage: 'Pluralized API ID',
                },
                intlLabel: {
                  id: getTrad('contentType.apiId-plural.label'),
                  defaultMessage: 'API ID (Plural)',
                },
                name: 'pluralName',
                type: 'text-plural',
              },
            ],
          },
        ],
      };
    },
    edit() {
      return {
        sections: [
          {
            sectionTitle: null,
            items: [
              nameField,
              {
                disabled: true,
                description: {
                  id: getTrad('contentType.apiId-singular.description'),
                  defaultMessage:
                    'Used to generate the API routes and databases tables/collections',
                },
                intlLabel: {
                  id: getTrad('contentType.apiId-singular.label'),
                  defaultMessage: 'API ID (Singular)',
                },
                name: 'singularName',
                type: 'text',
              },
              {
                type: 'pushRight',
                size: 6,
                intlLabel: { id: '', defaultMessage: '' },
                name: 'pushRight',
              },
              {
                disabled: true,
                description: {
                  id: getTrad('contentType.apiId-plural.description'),
                  defaultMessage: 'Pluralized API ID',
                },
                intlLabel: {
                  id: getTrad('contentType.apiId-plural.label'),
                  defaultMessage: 'API ID (Plural)',
                },
                name: 'pluralName',
                type: 'text',
              },
              {
                intlLabel: {
                  id: 'global.type',
                  defaultMessage: 'Type',
                },
                name: 'kind',
                type: 'content-type-radio-group',
                size: 12,
                radios: [
                  {
                    title: {
                      id: getTrad('form.button.collection-type.name'),
                      defaultMessage: 'Collection Type',
                    },
                    description: {
                      id: getTrad('form.button.collection-type.description'),
                      defaultMessage:
                        'Best for multiple instances like articles, products, comments, etc.',
                    },
                    value: 'collectionType',
                  },
                  {
                    title: {
                      id: getTrad('form.button.single-type.name'),
                      defaultMessage: 'Single Type',
                    },
                    description: {
                      id: getTrad('form.button.single-type.description'),
                      defaultMessage: 'Best for single instance like about us, homepage, etc.',
                    },
                    value: 'singleType',
                  },
                ],
              },
            ],
          },
        ],
      };
    },
  },
};
