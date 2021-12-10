/**
 * +----------------------------------------------------------------------
 * | 「e家宜业」 —— 助力物业服务升级，用心服务万千业主
 * +----------------------------------------------------------------------
 * | Copyright (c) 2020~2021 https://www.chowa.com All rights reserved.
 * +----------------------------------------------------------------------
 * | Licensed 未经许可不能去掉「e家宜业」和「卓瓦科技」相关版权
 * +----------------------------------------------------------------------
 * | Author: jixuecong@chowa.cn
 * +----------------------------------------------------------------------
 */

import { Action } from '~/types/action';
import { SUCCESS, IMPORT_TEMPLATE_ERROR } from '~/constant/code';
import * as ROLE from '~/constant/role_access';
import xlsx from 'node-xlsx';
import { File } from 'formidable';
import utils from '~/utils';
import { HOUSE, CARPORT, WAREHOUSE, MERCHANT, GARAGE } from '~/constant/building';
import moment from 'moment';

interface Record {
    type: typeof HOUSE | typeof CARPORT | typeof WAREHOUSE;
    area: string;
    building: string;
    unit: string;
    number: string;
    construction_area: number;
    name?: string;
    idcard?: string;
    phone?: string;
    error?: string[];
}

const PcBuildingParseAction = <Action>{
    router: {
        path: '/building/parse',
        method: 'post',
        authRequired: true,
        verifyCommunity: true,
        roles: [ROLE.FCDA]
    },
    validator: {
        body: [
            {
                name: 'community_id',
                required: true,
                regex: /^\d+$/
            }
        ],
        files: [
            {
                name: 'file',
                required: true
            }
        ]
    },
    response: async ctx => {
        const { file } = ctx.request.files;

        const sheetData = xlsx.parse((<File>file).path);
        const dataIndex = sheetData.findIndex(item => item.name === '固定资产数据');

        if (dataIndex < 0) {
            return (ctx.body = {
                code: IMPORT_TEMPLATE_ERROR,
                message: '导入模板错误，请使用标准模板导入'
            });
        }

        const rightData = <Record[]>[];
        const errorData = <Record[]>[];

        for (let item of sheetData[dataIndex].data) {
            if (!Array.isArray(item)) {
                continue;
            }

            const [
                type_label,
                area,
                building,
                unit,
                number,
                construction_area,
                excel_check_in_at,
                name,
                idcard,
                phone
            ] = item;
            let type = null;

            switch (type_label) {
                case '住宅':
                    type = HOUSE;
                    break;

                case '车位':
                    type = CARPORT;
                    break;

                case '仓房（仓库）':
                    type = WAREHOUSE;
                    break;

                case '商户':
                    type = MERCHANT;
                    break;

                case '车库':
                    type = GARAGE;
                    break;
            }

            if (!type) {
                continue;
            }

            const data = <Record>{
                type,
                area: area ? area : null,
                building: building ? building : null,
                unit: unit ? unit : null,
                number,
                construction_area,
                check_in_at: excel_check_in_at
                    ? moment(Math.round((excel_check_in_at - (25567 + 2)) * 86400 * 1000)).valueOf()
                    : null,
                name: name ? name : null,
                idcard: idcard ? idcard : null,
                phone: phone ? phone : null,
                error: []
            };

            const where = {
                type,
                area: area ? area : null,
                building: building ? building : null,
                unit: unit ? unit : null,
                number
            };

            const haveDefineOwerValue = [name, idcard, phone].some(val => val);
            const haveUndefineOwerValue = [name, idcard, phone].some(val => !val);
            const allDefinedOwerValue = [name, idcard, phone].every(val => val);

            if (area && area.length > 26) {
                data.error.push('「园区编号/建筑商开发期数」字数超过26个字');
            }

            if (building && building.length > 26) {
                data.error.push('「栋」字数超过26个字');
            }

            if (unit && unit.length > 26) {
                data.error.push('「单元/区域」字数超过26个字');
            }

            if (!number) {
                data.error.push('「门牌号/编号」不能为空');
            }

            if (number && number.length > 26) {
                data.error.push('「门牌号/编号」字数超过26个字');
            }

            if (!/^[1-9]\d*(\.\d+)?$/.test(construction_area)) {
                data.error.push('建筑面积错误');
            }

            if (excel_check_in_at && !/^\d+$/.test(excel_check_in_at)) {
                data.error.push('入住时间错误');
            }

            if (haveDefineOwerValue && haveUndefineOwerValue) {
                data.error.push('业主信息不完整');
            }

            if (allDefinedOwerValue && name.length > 12) {
                data.error.push('业主姓名字数超过12个字');
            }

            if (allDefinedOwerValue && !utils.idcard.verify(idcard)) {
                data.error.push('业主身份证错误');
            }

            if (allDefinedOwerValue && !/^1\d{10}$/.test(phone)) {
                data.error.push('业主手机号码错误');
            }

            if (
                await ctx.model
                    .from('ejyy_building_info')
                    .where(where)
                    .first()
            ) {
                data.error.push('已导入相同数据');
            }

            if (data.error.length) {
                errorData.push(data);
            } else {
                rightData.push(data);
            }
        }

        ctx.body = {
            code: SUCCESS,
            data: {
                rightData,
                errorData
            }
        };
    }
};

export default PcBuildingParseAction;
