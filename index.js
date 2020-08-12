#!/usr/bin/env node

/*
 * Copyright (c) 2020. Taimos GmbH http://www.taimos.de
 */
const AWS = require('aws-sdk');

const orgClient = new AWS.Organizations({region: 'us-east-1'});

async function getOrg() {
  const root = await getRootId();
  return resolve(root);
}

async function resolve(parent) {
  let NextToken;
  const item = {
    children: [],
    id: parent,
  }
  if (parent.startsWith('ou')) {
    const info = await orgClient.describeOrganizationalUnit({OrganizationalUnitId: parent}).promise();
    item.name = info.OrganizationalUnit.Name;
    item.type = 'OU';
  } else {
    item.name = 'Root';
    item.type = 'Root';
  }
  do {
    const res = await orgClient.listChildren({ParentId: parent, ChildType: 'ORGANIZATIONAL_UNIT'}).promise();
    if (res.Children) {
      item.children.push(...await Promise.all(res.Children.map(async (c) => resolve(c.Id))));
    }
    NextToken = res.NextToken;
  } while (NextToken);
  do {
    const res = await orgClient.listChildren({ParentId: parent, ChildType: 'ACCOUNT'}).promise();
    if (res.Children) {
      item.children.push(...await Promise.all(res.Children.map(async (c) => resolveAccount(c.Id))));
    }
    NextToken = res.NextToken;
  } while (NextToken);
  return item;
}

async function resolveAccount(accountId) {
  const account = await orgClient.describeAccount({AccountId: accountId}).promise();
  return {
    name: account.Account.Name,
    id: account.Account.Id,
    type: 'Account',
  };
}

async function getRootId() {
  let NextToken;
  do {
    const res = await orgClient.listRoots({NextToken}).promise();
    if (res.Roots && res.Roots.length === 1) {
      return res.Roots[0].Id;
    }
    NextToken = res.NextToken;
  } while (NextToken);
}

function formatDOTFile(org) {
  return `digraph AWSOrg {\n${getNodes(org).join('\n')}\n}`;
}

function getNodes(node) {
  const nodes = [];
  if (node.type === 'Account') {
    nodes.push(` "${node.id}" [label="${node.name}"];`);
  } else {
    nodes.push(` "${node.id}" [label="${node.name}"] [shape=box];`);
  }
  if (node.children) {
    node.children.forEach(c => {
      nodes.push(` "${node.id}" -> "${c.id}";`);
      nodes.push(...getNodes(c));
    });
  }
  return nodes;
}

(async () => {
  const org = await getOrg();
  console.log(formatDOTFile(org));
})().then();