// @generated by protoc-gen-es v2.6.0 with parameter "target=ts"
// @generated from file info/v1/info.proto (package info.v1, syntax proto3)
/* eslint-disable */

import type { GenFile, GenMessage, GenService } from "@bufbuild/protobuf/codegenv2";
import { fileDesc, messageDesc, serviceDesc } from "@bufbuild/protobuf/codegenv2";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file info/v1/info.proto.
 */
export const file_info_v1_info: GenFile = /*@__PURE__*/
  fileDesc("ChJpbmZvL3YxL2luZm8ucHJvdG8SB2luZm8udjEiJQoSUmVhZFZlcnNpb25SZXF1ZXN0Eg8KB3ZlcnNpb24YASABKAkiXgoHQXBwSW5mbxIPCgd2ZXJzaW9uGAEgASgJEg8KB2ZsYXZvdXIYAiABKAkSDgoGY29tbWl0GAMgASgJEhEKCWJ1aWxkRGF0ZRgEIAEoCRIOCgZicmFuY2gYBSABKAkiPAoJQ2hhbmdlbG9nEg8KB3ZlcnNpb24YASABKAkSCwoDdXJsGAIgASgJEhEKCWNoYW5nZWxvZxgDIAEoCSIHCgVFbXB0eTKtAQoLSW5mb1NlcnZpY2USMgoMR2V0Q2hhbmdlbG9nEg4uaW5mby52MS5FbXB0eRoSLmluZm8udjEuQ2hhbmdlbG9nEi4KCkdldEFwcEluZm8SDi5pbmZvLnYxLkVtcHR5GhAuaW5mby52MS5BcHBJbmZvEjoKC1JlYWRWZXJzaW9uEhsuaW5mby52MS5SZWFkVmVyc2lvblJlcXVlc3QaDi5pbmZvLnYxLkVtcHR5QoEBCgtjb20uaW5mby52MUIJSW5mb1Byb3RvUAFaKmdpdGh1Yi5jb20vUkEzNDEvZG9ja21hbi9nZW5lcmF0ZWQvaW5mby92MaICA0lYWKoCB0luZm8uVjHKAgdJbmZvXFYx4gITSW5mb1xWMVxHUEJNZXRhZGF0YeoCCEluZm86OlYxYgZwcm90bzM");

/**
 * @generated from message info.v1.ReadVersionRequest
 */
export type ReadVersionRequest = Message<"info.v1.ReadVersionRequest"> & {
  /**
   * @generated from field: string version = 1;
   */
  version: string;
};

/**
 * Describes the message info.v1.ReadVersionRequest.
 * Use `create(ReadVersionRequestSchema)` to create a new message.
 */
export const ReadVersionRequestSchema: GenMessage<ReadVersionRequest> = /*@__PURE__*/
  messageDesc(file_info_v1_info, 0);

/**
 * @generated from message info.v1.AppInfo
 */
export type AppInfo = Message<"info.v1.AppInfo"> & {
  /**
   * @generated from field: string version = 1;
   */
  version: string;

  /**
   * @generated from field: string flavour = 2;
   */
  flavour: string;

  /**
   * @generated from field: string commit = 3;
   */
  commit: string;

  /**
   * @generated from field: string buildDate = 4;
   */
  buildDate: string;

  /**
   * @generated from field: string branch = 5;
   */
  branch: string;
};

/**
 * Describes the message info.v1.AppInfo.
 * Use `create(AppInfoSchema)` to create a new message.
 */
export const AppInfoSchema: GenMessage<AppInfo> = /*@__PURE__*/
  messageDesc(file_info_v1_info, 1);

/**
 * @generated from message info.v1.Changelog
 */
export type Changelog = Message<"info.v1.Changelog"> & {
  /**
   * @generated from field: string version = 1;
   */
  version: string;

  /**
   * @generated from field: string url = 2;
   */
  url: string;

  /**
   * @generated from field: string changelog = 3;
   */
  changelog: string;
};

/**
 * Describes the message info.v1.Changelog.
 * Use `create(ChangelogSchema)` to create a new message.
 */
export const ChangelogSchema: GenMessage<Changelog> = /*@__PURE__*/
  messageDesc(file_info_v1_info, 2);

/**
 * @generated from message info.v1.Empty
 */
export type Empty = Message<"info.v1.Empty"> & {
};

/**
 * Describes the message info.v1.Empty.
 * Use `create(EmptySchema)` to create a new message.
 */
export const EmptySchema: GenMessage<Empty> = /*@__PURE__*/
  messageDesc(file_info_v1_info, 3);

/**
 * @generated from service info.v1.InfoService
 */
export const InfoService: GenService<{
  /**
   * @generated from rpc info.v1.InfoService.GetChangelog
   */
  getChangelog: {
    methodKind: "unary";
    input: typeof EmptySchema;
    output: typeof ChangelogSchema;
  },
  /**
   * @generated from rpc info.v1.InfoService.GetAppInfo
   */
  getAppInfo: {
    methodKind: "unary";
    input: typeof EmptySchema;
    output: typeof AppInfoSchema;
  },
  /**
   * @generated from rpc info.v1.InfoService.ReadVersion
   */
  readVersion: {
    methodKind: "unary";
    input: typeof ReadVersionRequestSchema;
    output: typeof EmptySchema;
  },
}> = /*@__PURE__*/
  serviceDesc(file_info_v1_info, 0);

