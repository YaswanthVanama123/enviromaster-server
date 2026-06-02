import { ServiceConfig } from "../models/service/index.js";

export async function createServiceConfig(data) {
  if (data.isActive) {
    await ServiceConfig.updateMany(
      { serviceId: data.serviceId, isActive: true },
      { $set: { isActive: false } }
    );
  }

  const doc = new ServiceConfig(data);
  return doc.save();
}

export async function getAllServiceConfigs({ serviceId } = {}) {
  const filter = {};
  if (serviceId) {
    filter.serviceId = serviceId;
  }
  return ServiceConfig.find(filter).sort({ serviceId: 1, createdAt: -1 }).lean();
}

export async function getServiceConfigById(id) {
  return ServiceConfig.findById(id);
}

export async function getActiveServiceConfigs(serviceId) {
  if (serviceId) {
    return ServiceConfig.findOne({ serviceId, isActive: true })
      .sort({ updatedAt: -1 })
      .lean();
  }
  return ServiceConfig.find({ isActive: true }).sort({ serviceId: 1 }).lean();
}

export async function getLatestConfigForService(serviceId) {
  return ServiceConfig.findOne({ serviceId }).sort({ createdAt: -1 }).lean();
}

export async function replaceServiceConfig(id, data) {
  const existing = await ServiceConfig.findById(id);
  if (!existing) return null;

  if (data.isActive) {
    await ServiceConfig.updateMany(
      {
        _id: { $ne: id },
        serviceId: data.serviceId || existing.serviceId,
        isActive: true,
      },
      { $set: { isActive: false } }
    );
  }

  existing.serviceId = data.serviceId;
  existing.version = data.version;
  existing.label = data.label;
  existing.description = data.description;
  existing.config = data.config;
  existing.defaultFormState = data.defaultFormState;
  existing.isActive = !!data.isActive;
  existing.adminByDisplay = data.adminByDisplay !== undefined ? !!data.adminByDisplay : true;
  existing.tags = Array.isArray(data.tags) ? data.tags : existing.tags;

  return existing.save();
}

export async function mergeServiceConfig(id, partial) {
  const existing = await ServiceConfig.findById(id);
  if (!existing) return null;

  if (partial.serviceId) existing.serviceId = partial.serviceId;
  if (partial.version) existing.version = partial.version;
  if (typeof partial.label === "string") existing.label = partial.label;
  if (typeof partial.description === "string")
    existing.description = partial.description;

  if (partial.config) {
    existing.config = {
      ...(existing.config || {}),
      ...partial.config,
    };
  }

  if (partial.defaultFormState) {
    existing.defaultFormState = {
      ...(existing.defaultFormState || {}),
      ...partial.defaultFormState,
    };
  }

  if (Array.isArray(partial.tags)) {
    existing.tags = partial.tags;
  }

  if (typeof partial.isActive === "boolean") {
    existing.isActive = partial.isActive;

    if (partial.isActive) {
      await ServiceConfig.updateMany(
        {
          _id: { $ne: id },
          serviceId: existing.serviceId,
          isActive: true,
        },
        { $set: { isActive: false } }
      );
    }
  }

  if (typeof partial.adminByDisplay === "boolean") {
    existing.adminByDisplay = partial.adminByDisplay;
  }

  if (Array.isArray(partial.images)) {
    existing.images = partial.images;
  }

  if (Array.isArray(partial.links)) {
    existing.links = partial.links;
  }

  return existing.save();
}

export async function deleteServiceConfig(id) {
  return ServiceConfig.findByIdAndDelete(id);
}

export async function deleteServiceConfigsByServiceId(serviceId) {
  return ServiceConfig.deleteMany({ serviceId });
}
