// @generated by protoc-gen-es v2.6.0 with parameter "target=ts"
// @generated from file docker/v1/docker.proto (package docker.v1, syntax proto3)
/* eslint-disable */

import type { GenEnum, GenFile, GenMessage, GenService } from "@bufbuild/protobuf/codegenv2";
import { enumDesc, fileDesc, messageDesc, serviceDesc } from "@bufbuild/protobuf/codegenv2";
import type { Message } from "@bufbuild/protobuf";

/**
 * Describes the file docker/v1/docker.proto.
 */
export const file_docker_v1_docker: GenFile = /*@__PURE__*/
  fileDesc("ChZkb2NrZXIvdjEvZG9ja2VyLnByb3RvEglkb2NrZXIudjEiKwoUQ29udGFpbmVyTG9nc1JlcXVlc3QSEwoLY29udGFpbmVySUQYASABKAkiHgoLTG9nc01lc3NhZ2USDwoHbWVzc2FnZRgBIAEoCSJlCg1TdGF0c1Jlc3BvbnNlEiUKBnN5c3RlbRgBIAEoCzIVLmRvY2tlci52MS5TeXN0ZW1JbmZvEi0KCmNvbnRhaW5lcnMYAiADKAsyGS5kb2NrZXIudjEuQ29udGFpbmVyU3RhdHMifAoMU3RhdHNSZXF1ZXN0EiQKBGZpbGUYASABKAsyFi5kb2NrZXIudjEuQ29tcG9zZUZpbGUSJQoGc29ydEJ5GAIgASgOMhUuZG9ja2VyLnYxLlNPUlRfRklFTEQSHwoFb3JkZXIYAyABKA4yEC5kb2NrZXIudjEuT1JERVIiLQoKU3lzdGVtSW5mbxILCgNDUFUYASABKAESEgoKbWVtSW5CeXRlcxgCIAEoBCI2CgxMaXN0UmVzcG9uc2USJgoEbGlzdBgBIAMoCzIYLmRvY2tlci52MS5Db250YWluZXJMaXN0IqMBCg1Db250YWluZXJMaXN0EgoKAmlkGAEgASgJEg8KB2ltYWdlSUQYAiABKAkSEQoJaW1hZ2VOYW1lGAMgASgJEg4KBnN0YXR1cxgEIAEoCRIMCgRuYW1lGAUgASgJEg8KB2NyZWF0ZWQYBiABKAkSHgoFcG9ydHMYByADKAsyDy5kb2NrZXIudjEuUG9ydBITCgtzZXJ2aWNlTmFtZRgIIAEoCSK6AQoOQ29udGFpbmVyU3RhdHMSCgoCaWQYASABKAkSDAoEbmFtZRgCIAEoCRIRCgljcHVfdXNhZ2UYAyABKAESFAoMbWVtb3J5X3VzYWdlGAQgASgEEhQKDG1lbW9yeV9saW1pdBgFIAEoBBISCgpuZXR3b3JrX3J4GAYgASgEEhIKCm5ldHdvcmtfdHgYByABKAQSEgoKYmxvY2tfcmVhZBgIIAEoBBITCgtibG9ja193cml0ZRgJIAEoBCJDCgRQb3J0Eg4KBnB1YmxpYxgBIAEoBRIPCgdwcml2YXRlGAIgASgFEgwKBGhvc3QYAyABKAkSDAoEdHlwZRgEIAEoCSIHCgVFbXB0eSI5CgtDb21wb3NlRmlsZRIQCghmaWxlbmFtZRgBIAEoCRIYChBzZWxlY3RlZFNlcnZpY2VzGAIgAygJKmAKClNPUlRfRklFTEQSCAoETkFNRRAAEgcKA0NQVRABEgcKA01FTRACEg4KCk5FVFdPUktfUlgQAxIOCgpORVRXT1JLX1RYEAQSCgoGRElTS19SEAUSCgoGRElTS19XEAYqGQoFT1JERVISBwoDRFNDEAASBwoDQVNDEAEygQQKDURvY2tlclNlcnZpY2USOwoFU3RhcnQSFi5kb2NrZXIudjEuQ29tcG9zZUZpbGUaFi5kb2NrZXIudjEuTG9nc01lc3NhZ2UiADABEjoKBFN0b3ASFi5kb2NrZXIudjEuQ29tcG9zZUZpbGUaFi5kb2NrZXIudjEuTG9nc01lc3NhZ2UiADABEjwKBlJlbW92ZRIWLmRvY2tlci52MS5Db21wb3NlRmlsZRoWLmRvY2tlci52MS5Mb2dzTWVzc2FnZSIAMAESPQoHUmVzdGFydBIWLmRvY2tlci52MS5Db21wb3NlRmlsZRoWLmRvY2tlci52MS5Mb2dzTWVzc2FnZSIAMAESPAoGVXBkYXRlEhYuZG9ja2VyLnYxLkNvbXBvc2VGaWxlGhYuZG9ja2VyLnYxLkxvZ3NNZXNzYWdlIgAwARI5CgRMaXN0EhYuZG9ja2VyLnYxLkNvbXBvc2VGaWxlGhcuZG9ja2VyLnYxLkxpc3RSZXNwb25zZSIAEjwKBVN0YXRzEhcuZG9ja2VyLnYxLlN0YXRzUmVxdWVzdBoYLmRvY2tlci52MS5TdGF0c1Jlc3BvbnNlIgASQwoETG9ncxIfLmRvY2tlci52MS5Db250YWluZXJMb2dzUmVxdWVzdBoWLmRvY2tlci52MS5Mb2dzTWVzc2FnZSIAMAFCjwEKDWNvbS5kb2NrZXIudjFCC0RvY2tlclByb3RvUAFaLGdpdGh1Yi5jb20vUkEzNDEvZG9ja21hbi9nZW5lcmF0ZWQvZG9ja2VyL3YxogIDRFhYqgIJRG9ja2VyLlYxygIJRG9ja2VyXFYx4gIVRG9ja2VyXFYxXEdQQk1ldGFkYXRh6gIKRG9ja2VyOjpWMWIGcHJvdG8z");

/**
 * @generated from message docker.v1.ContainerLogsRequest
 */
export type ContainerLogsRequest = Message<"docker.v1.ContainerLogsRequest"> & {
  /**
   * @generated from field: string containerID = 1;
   */
  containerID: string;
};

/**
 * Describes the message docker.v1.ContainerLogsRequest.
 * Use `create(ContainerLogsRequestSchema)` to create a new message.
 */
export const ContainerLogsRequestSchema: GenMessage<ContainerLogsRequest> = /*@__PURE__*/
  messageDesc(file_docker_v1_docker, 0);

/**
 * @generated from message docker.v1.LogsMessage
 */
export type LogsMessage = Message<"docker.v1.LogsMessage"> & {
  /**
   * @generated from field: string message = 1;
   */
  message: string;
};

/**
 * Describes the message docker.v1.LogsMessage.
 * Use `create(LogsMessageSchema)` to create a new message.
 */
export const LogsMessageSchema: GenMessage<LogsMessage> = /*@__PURE__*/
  messageDesc(file_docker_v1_docker, 1);

/**
 * @generated from message docker.v1.StatsResponse
 */
export type StatsResponse = Message<"docker.v1.StatsResponse"> & {
  /**
   * @generated from field: docker.v1.SystemInfo system = 1;
   */
  system?: SystemInfo;

  /**
   * @generated from field: repeated docker.v1.ContainerStats containers = 2;
   */
  containers: ContainerStats[];
};

/**
 * Describes the message docker.v1.StatsResponse.
 * Use `create(StatsResponseSchema)` to create a new message.
 */
export const StatsResponseSchema: GenMessage<StatsResponse> = /*@__PURE__*/
  messageDesc(file_docker_v1_docker, 2);

/**
 * @generated from message docker.v1.StatsRequest
 */
export type StatsRequest = Message<"docker.v1.StatsRequest"> & {
  /**
   * @generated from field: docker.v1.ComposeFile file = 1;
   */
  file?: ComposeFile;

  /**
   * @generated from field: docker.v1.SORT_FIELD sortBy = 2;
   */
  sortBy: SORT_FIELD;

  /**
   * @generated from field: docker.v1.ORDER order = 3;
   */
  order: ORDER;
};

/**
 * Describes the message docker.v1.StatsRequest.
 * Use `create(StatsRequestSchema)` to create a new message.
 */
export const StatsRequestSchema: GenMessage<StatsRequest> = /*@__PURE__*/
  messageDesc(file_docker_v1_docker, 3);

/**
 * @generated from message docker.v1.SystemInfo
 */
export type SystemInfo = Message<"docker.v1.SystemInfo"> & {
  /**
   * represents float64
   *
   * @generated from field: double CPU = 1;
   */
  CPU: number;

  /**
   * @generated from field: uint64 memInBytes = 2;
   */
  memInBytes: bigint;
};

/**
 * Describes the message docker.v1.SystemInfo.
 * Use `create(SystemInfoSchema)` to create a new message.
 */
export const SystemInfoSchema: GenMessage<SystemInfo> = /*@__PURE__*/
  messageDesc(file_docker_v1_docker, 4);

/**
 * @generated from message docker.v1.ListResponse
 */
export type ListResponse = Message<"docker.v1.ListResponse"> & {
  /**
   * @generated from field: repeated docker.v1.ContainerList list = 1;
   */
  list: ContainerList[];
};

/**
 * Describes the message docker.v1.ListResponse.
 * Use `create(ListResponseSchema)` to create a new message.
 */
export const ListResponseSchema: GenMessage<ListResponse> = /*@__PURE__*/
  messageDesc(file_docker_v1_docker, 5);

/**
 * @generated from message docker.v1.ContainerList
 */
export type ContainerList = Message<"docker.v1.ContainerList"> & {
  /**
   * @generated from field: string id = 1;
   */
  id: string;

  /**
   * @generated from field: string imageID = 2;
   */
  imageID: string;

  /**
   * @generated from field: string imageName = 3;
   */
  imageName: string;

  /**
   * @generated from field: string status = 4;
   */
  status: string;

  /**
   * @generated from field: string name = 5;
   */
  name: string;

  /**
   * @generated from field: string created = 6;
   */
  created: string;

  /**
   * @generated from field: repeated docker.v1.Port ports = 7;
   */
  ports: Port[];

  /**
   * name to use in selecting service in docker compose
   *
   * @generated from field: string serviceName = 8;
   */
  serviceName: string;
};

/**
 * Describes the message docker.v1.ContainerList.
 * Use `create(ContainerListSchema)` to create a new message.
 */
export const ContainerListSchema: GenMessage<ContainerList> = /*@__PURE__*/
  messageDesc(file_docker_v1_docker, 6);

/**
 * ContainerInfo holds metrics for a single Docker container.
 *
 * @generated from message docker.v1.ContainerStats
 */
export type ContainerStats = Message<"docker.v1.ContainerStats"> & {
  /**
   * Unique identifier of the container.
   *
   * @generated from field: string id = 1;
   */
  id: string;

  /**
   * Name of the container.
   *
   * @generated from field: string name = 2;
   */
  name: string;

  /**
   * CPU usage as a percentage.
   *
   * @generated from field: double cpu_usage = 3;
   */
  cpuUsage: number;

  /**
   * Current memory usage in bytes.
   *
   * @generated from field: uint64 memory_usage = 4;
   */
  memoryUsage: bigint;

  /**
   * Maximum memory limit in bytes.
   *
   * @generated from field: uint64 memory_limit = 5;
   */
  memoryLimit: bigint;

  /**
   * Total bytes received over the network.
   *
   * @generated from field: uint64 network_rx = 6;
   */
  networkRx: bigint;

  /**
   * Total bytes sent over the network.
   *
   * @generated from field: uint64 network_tx = 7;
   */
  networkTx: bigint;

  /**
   * Total bytes read from block devices.
   *
   * @generated from field: uint64 block_read = 8;
   */
  blockRead: bigint;

  /**
   * Total bytes written to block devices.
   *
   * @generated from field: uint64 block_write = 9;
   */
  blockWrite: bigint;
};

/**
 * Describes the message docker.v1.ContainerStats.
 * Use `create(ContainerStatsSchema)` to create a new message.
 */
export const ContainerStatsSchema: GenMessage<ContainerStats> = /*@__PURE__*/
  messageDesc(file_docker_v1_docker, 7);

/**
 * @generated from message docker.v1.Port
 */
export type Port = Message<"docker.v1.Port"> & {
  /**
   * @generated from field: int32 public = 1;
   */
  public: number;

  /**
   * @generated from field: int32 private = 2;
   */
  private: number;

  /**
   * @generated from field: string host = 3;
   */
  host: string;

  /**
   * @generated from field: string type = 4;
   */
  type: string;
};

/**
 * Describes the message docker.v1.Port.
 * Use `create(PortSchema)` to create a new message.
 */
export const PortSchema: GenMessage<Port> = /*@__PURE__*/
  messageDesc(file_docker_v1_docker, 8);

/**
 * @generated from message docker.v1.Empty
 */
export type Empty = Message<"docker.v1.Empty"> & {
};

/**
 * Describes the message docker.v1.Empty.
 * Use `create(EmptySchema)` to create a new message.
 */
export const EmptySchema: GenMessage<Empty> = /*@__PURE__*/
  messageDesc(file_docker_v1_docker, 9);

/**
 * @generated from message docker.v1.ComposeFile
 */
export type ComposeFile = Message<"docker.v1.ComposeFile"> & {
  /**
   * @generated from field: string filename = 1;
   */
  filename: string;

  /**
   * @generated from field: repeated string selectedServices = 2;
   */
  selectedServices: string[];
};

/**
 * Describes the message docker.v1.ComposeFile.
 * Use `create(ComposeFileSchema)` to create a new message.
 */
export const ComposeFileSchema: GenMessage<ComposeFile> = /*@__PURE__*/
  messageDesc(file_docker_v1_docker, 10);

/**
 * @generated from enum docker.v1.SORT_FIELD
 */
export enum SORT_FIELD {
  /**
   * @generated from enum value: NAME = 0;
   */
  NAME = 0,

  /**
   * @generated from enum value: CPU = 1;
   */
  CPU = 1,

  /**
   * @generated from enum value: MEM = 2;
   */
  MEM = 2,

  /**
   * @generated from enum value: NETWORK_RX = 3;
   */
  NETWORK_RX = 3,

  /**
   * @generated from enum value: NETWORK_TX = 4;
   */
  NETWORK_TX = 4,

  /**
   * @generated from enum value: DISK_R = 5;
   */
  DISK_R = 5,

  /**
   * @generated from enum value: DISK_W = 6;
   */
  DISK_W = 6,
}

/**
 * Describes the enum docker.v1.SORT_FIELD.
 */
export const SORT_FIELDSchema: GenEnum<SORT_FIELD> = /*@__PURE__*/
  enumDesc(file_docker_v1_docker, 0);

/**
 * @generated from enum docker.v1.ORDER
 */
export enum ORDER {
  /**
   * default val
   *
   * @generated from enum value: DSC = 0;
   */
  DSC = 0,

  /**
   * @generated from enum value: ASC = 1;
   */
  ASC = 1,
}

/**
 * Describes the enum docker.v1.ORDER.
 */
export const ORDERSchema: GenEnum<ORDER> = /*@__PURE__*/
  enumDesc(file_docker_v1_docker, 1);

/**
 * @generated from service docker.v1.DockerService
 */
export const DockerService: GenService<{
  /**
   * @generated from rpc docker.v1.DockerService.Start
   */
  start: {
    methodKind: "server_streaming";
    input: typeof ComposeFileSchema;
    output: typeof LogsMessageSchema;
  },
  /**
   * @generated from rpc docker.v1.DockerService.Stop
   */
  stop: {
    methodKind: "server_streaming";
    input: typeof ComposeFileSchema;
    output: typeof LogsMessageSchema;
  },
  /**
   * @generated from rpc docker.v1.DockerService.Remove
   */
  remove: {
    methodKind: "server_streaming";
    input: typeof ComposeFileSchema;
    output: typeof LogsMessageSchema;
  },
  /**
   * @generated from rpc docker.v1.DockerService.Restart
   */
  restart: {
    methodKind: "server_streaming";
    input: typeof ComposeFileSchema;
    output: typeof LogsMessageSchema;
  },
  /**
   * @generated from rpc docker.v1.DockerService.Update
   */
  update: {
    methodKind: "server_streaming";
    input: typeof ComposeFileSchema;
    output: typeof LogsMessageSchema;
  },
  /**
   * @generated from rpc docker.v1.DockerService.List
   */
  list: {
    methodKind: "unary";
    input: typeof ComposeFileSchema;
    output: typeof ListResponseSchema;
  },
  /**
   * @generated from rpc docker.v1.DockerService.Stats
   */
  stats: {
    methodKind: "unary";
    input: typeof StatsRequestSchema;
    output: typeof StatsResponseSchema;
  },
  /**
   * @generated from rpc docker.v1.DockerService.Logs
   */
  logs: {
    methodKind: "server_streaming";
    input: typeof ContainerLogsRequestSchema;
    output: typeof LogsMessageSchema;
  },
}> = /*@__PURE__*/
  serviceDesc(file_docker_v1_docker, 0);

