import { DataTypes, Model } from "sequelize";
import path from 'path';
import sequelize from './sequelize';
import { ROOT_DIR } from "./constants";
import { readFileSync } from "fs-extra";
import { UpscalerModel } from "./UpscalerModel";
import asyncPool from "tiny-async-pool";
import { ModelDefinition } from "upscaler";
import { BaseModel } from "./BaseModel";
import { ProgressBar } from "../../../utils/ProgressBar";
import { TF } from "./types";
const Upscaler = require('upscaler/node');

const packageJSONs = new Map<string, Record<string, any>>();

export class Package extends BaseModel {
  declare _id: number;
  declare name: string;
  upscalers = new Map<string, [typeof Upscaler, ModelDefinition]>();
  useGPU = false
  tf?: TF;

  getPackageName() {
    return Package.getPackageJSON(this.name).name;
  }

  static getPackageJSON(packageName: string) {
    const packageJSON = packageJSONs.get(packageName);
    if (!packageJSON) {
      const modelPackageFolder = path.resolve(ROOT_DIR, 'models', packageName);
      const packageJSON = JSON.parse(readFileSync(path.resolve(modelPackageFolder, 'package.json'), 'utf-8'));
      packageJSONs.set(packageName, packageJSON);
      return packageJSON;
    }
    return packageJSON;
  }

  static getExportedModelsFromPackageJSON(packageName: string): string[] {
    const { exports } = Package.getPackageJSON(packageName);
    const keys = Object.keys(exports);
    if (keys.length === 1 && keys[0] === '.') {
      return keys;
    }
    // If we have a root level ./ definition, it means the model is bucket exporting all it's available
    // models. That means we can skip this entry.
    // return Object.keys(exports).filter(key => key !== '.').map(key => [key, path.join(name, key)]);
    return Object.keys(exports).filter(key => key !== '.');
  }

  static returnUpsert = BaseModel.makeReturnUpsert<Package>(({ name }) => Package.upsert({
    name,
  }), `
      SELECT id FROM packages WHERE name = :name
  `, ({ name }) => ({
    name,
  }));

  async getUpscalerModels() {
    return UpscalerModel.findAll({
      where: {
        PackageId: this.getId(),
      }
    });
  }

  async getUpscaler(modelName: string): Promise<[typeof Upscaler, ModelDefinition]> {
    const useGPU = this.useGPU;
    const modelPath = UpscalerModel.buildModelPath(this.name, modelName);
    const upscaler = this.upscalers.get(modelPath);
    if (!upscaler) {
      if (!this.tf) {
        throw new Error('No tensorflow defined');
      }
      const _upscaler = await UpscalerModel.getUpscaler(this.tf, this.name, modelName, useGPU);
      this.upscalers.set(modelPath, _upscaler);
      return _upscaler;
    }
    return upscaler;
  }

  async addModels() {
    const packageName = this.name;
    const modelKeysAndPaths = Package.getExportedModelsFromPackageJSON(packageName);
    const existingUpscalerModelNames = new Set<any>((await this.getUpscalerModels()).map(model => model.name));
    const progressBar = new ProgressBar(modelKeysAndPaths.length);

    const processFile = async (modelName: string) => {
      // const modelPath = path.join(packageName, modelName);
      if (!existingUpscalerModelNames.has(modelName)) {
        const PackageId = this.getId();
        if (PackageId > 10) {
          throw new Error(`Unexpected ID: ${PackageId}`)
        }
        const [_, modelDefinition] = await this.getUpscaler(modelName);
        try {
          await UpscalerModel.upsert({
            name: modelName,
            scale: modelDefinition.scale,
            meta: modelDefinition.meta,
            PackageId,
          });
        } catch (err) {
          console.error('Failed to insert model for', {
            name: modelName,
            scale: modelDefinition.scale,
            meta: modelDefinition.meta,
            PackageId
          });
          throw err;
        }
      }
    };
    for await (const value of asyncPool(5, modelKeysAndPaths, processFile)) {
      progressBar.update();
    }
    progressBar.end();
  }

  get models() {
    return new Promise<UpscalerModel[]>(async resolve => {
      const models = await this.getUpscalerModels();
      await Promise.all(models.map(async model => {
        const [upscaler, modelDefinition] = await this.getUpscaler(model.name);
        model.upscaler = upscaler;
        model.modelDefinition = modelDefinition;
      }));
      return resolve(models);
    });
  }
}

Package.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
}, {
  sequelize,
  modelName: 'Package'
});