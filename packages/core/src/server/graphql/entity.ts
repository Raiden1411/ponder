import {
  GraphQLFieldConfigMap,
  GraphQLFieldResolver,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLString,
} from "graphql";

import type { Entity } from "@/schema/types";

import type { Context, Source } from "./schema";

export const buildEntityType = ({
  entity,
  entityGqlTypes,
}: {
  entity: Entity;
  entityGqlTypes: Record<string, GraphQLObjectType<Source, Context>>;
}): GraphQLObjectType<Source, Context> => {
  return new GraphQLObjectType({
    name: entity.name,
    fields: () => {
      const fieldConfigMap: GraphQLFieldConfigMap<Source, Context> = {};

      entity.fields.forEach((field) => {
        switch (field.kind) {
          case "SCALAR": {
            fieldConfigMap[field.name] = {
              type: field.notNull
                ? new GraphQLNonNull(field.scalarGqlType)
                : field.scalarGqlType,
              // Convert bigints to strings for GraphQL responses.
              resolve:
                field.scalarTypeName === "BigInt"
                  ? // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    (parent) => (parent[field.name] as bigint).toString()
                  : undefined,
            };
            break;
          }
          case "ENUM": {
            fieldConfigMap[field.name] = {
              type: field.notNull
                ? new GraphQLNonNull(field.enumGqlType)
                : field.enumGqlType,
            };
            break;
          }
          case "RELATIONSHIP": {
            const resolver: GraphQLFieldResolver<Source, Context> = async (
              parent,
              args,
              context
            ) => {
              const { store } = context;

              // The parent object gets passed in here with relationship fields defined as the
              // string ID of the related entity. Here, we get the ID and query for that entity.
              // Then, the GraphQL server serves the resolved object here instead of the ID.
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              const relatedInstanceId = parent[field.name];

              return await store.findUnique({
                modelName: field.relatedEntityName,
                id: relatedInstanceId,
              });
            };

            fieldConfigMap[field.name] = {
              type: entityGqlTypes[field.baseGqlType.name],
              resolve: resolver,
            };

            break;
          }
          case "DERIVED": {
            const resolver: GraphQLFieldResolver<Source, Context> = async (
              parent,
              args,
              context
            ) => {
              const { store } = context;

              // The parent object gets passed in here with relationship fields defined as the
              // string ID of the related entity. Here, we get the ID and query for that entity.
              // Then, the GraphQL server serves the resolved object here instead of the ID.
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              const entityId = parent.id;

              const filter = args;

              return await store.findMany({
                modelName: field.derivedFromEntityName,
                filter: {
                  where: { [field.derivedFromFieldName]: entityId },
                  skip: filter.skip,
                  first: filter.first,
                  orderBy: filter.orderBy,
                  orderDirection: filter.orderDirection,
                },
                timestamp: filter.timestamp ? filter.timestamp : undefined,
              });
            };

            fieldConfigMap[field.name] = {
              type: new GraphQLNonNull(
                new GraphQLList(
                  new GraphQLNonNull(entityGqlTypes[field.baseGqlType.name])
                )
              ),
              args: {
                skip: { type: GraphQLInt, defaultValue: 0 },
                first: { type: GraphQLInt, defaultValue: 100 },
                orderBy: { type: GraphQLString, defaultValue: "id" },
                orderDirection: { type: GraphQLString, defaultValue: "asc" },
                timestamp: { type: GraphQLInt },
              },
              resolve: resolver,
            };

            break;
          }
          case "LIST": {
            const listType = new GraphQLList(
              field.isListElementNotNull
                ? new GraphQLNonNull(field.baseGqlType as GraphQLOutputType)
                : field.baseGqlType
            );
            fieldConfigMap[field.name] = {
              type: field.notNull ? new GraphQLNonNull(listType) : listType,
            };
            break;
          }
        }
      });

      return fieldConfigMap;
    },
  });
};
